import { ColumnMetadata, ColumnType, TableSchema } from './schemaTypes.js';

type QueryFunction = (sql: string) => Promise<any[]>;

export async function detectSchema(
  tableName: string,
  queryFn: QueryFunction
): Promise<TableSchema> {
  // Get column information from DuckDB
  const columnInfo = await queryFn(`DESCRIBE ${tableName}`);

  const columns: ColumnMetadata[] = [];

  for (const col of columnInfo) {
    const columnName = col.column_name;
    const duckdbType = col.column_type.toUpperCase();

    // Get statistics for this column
    const stats = await queryFn(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT "${columnName}") as distinct,
        COUNT(*) - COUNT("${columnName}") as nulls
      FROM ${tableName}
    `);

    const totalRows = toNumber(stats[0].total);
    const distinctCount = toNumber(stats[0].distinct);
    const nullCount = toNumber(stats[0].nulls);

    // Sample a few values
    const samples = await queryFn(`
      SELECT "${columnName}"
      FROM ${tableName}
      WHERE "${columnName}" IS NOT NULL
      LIMIT 5
    `);
    const sampleValues = samples.map(s => s[columnName]);

    // Classify column type (with sample checking for date strings)
    let isDateString = false;
    if (duckdbType.includes('VARCHAR') || duckdbType.includes('TEXT')) {
      try {
        const dateCheck = await queryFn(`
          SELECT count(*) as cnt FROM (
            SELECT TRY_CAST("${columnName}" AS DATE) as d
            FROM ${tableName}
            WHERE "${columnName}" IS NOT NULL AND length(trim(CAST("${columnName}" AS VARCHAR))) >= 6
            LIMIT 10
          ) WHERE d IS NOT NULL
        `);
        const validDates = Number(dateCheck[0]?.cnt || 0);
        if (validDates >= 3 && validDates >= Math.min(samples.length, 5) * 0.7) {
          isDateString = true;
        }
      } catch {}
    }

    const detectedType = classifyColumn(
      columnName,
      duckdbType,
      distinctCount,
      totalRows,
      sampleValues,
      isDateString
    );

    columns.push({
      name: columnName,
      detectedType,
      duckdbType,
      distinctCount,
      nullCount,
      totalRows,
      sampleValues
    });
  }

  return {
    tableName,
    columns
  };
}

function toNumber(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function classifyColumn(
  columnName: string,
  duckdbType: string,
  distinctCount: number,
  totalRows: number,
  _sampleValues: any[],
  isDateString: boolean = false
): ColumnType {
  const lower = columnName.toLowerCase().trim();

  // Date/Timestamp detection
  if (isDateString || duckdbType.includes('DATE') || duckdbType.includes('TIMESTAMP')) {
    return ColumnType.DATE;
  }

  // Boolean detection
  if (duckdbType.includes('BOOLEAN')) {
    return ColumnType.BOOLEAN;
  }

  // Identifiers / Key codes
  const isIdPattern = /(_id|^id$|id$|_key$|^key$|_code$|^code$|zip|postal|phone|ssn|account|row_num|record_num|isbn|uuid|guid)/i.test(lower);
  const cardinalityRatio = totalRows > 0 ? distinctCount / totalRows : 0;

  // Numeric detection
  if (
    duckdbType.includes('INTEGER') ||
    duckdbType.includes('BIGINT') ||
    duckdbType.includes('DOUBLE') ||
    duckdbType.includes('DECIMAL') ||
    duckdbType.includes('FLOAT') ||
    duckdbType.includes('NUMERIC')
  ) {
    // Flag ID columns that are stored as integers
    if (isIdPattern) {
      return ColumnType.IDENTIFIER;
    }

    // High cardinality integers (>85% unique and >30 rows) are usually sequence IDs
    if (cardinalityRatio > 0.85 && totalRows > 30 && (duckdbType.includes('INT') || duckdbType.includes('BIGINT'))) {
      return ColumnType.IDENTIFIER;
    }

    // Year column (e.g. 2020, 2021, 2022) is better treated as categorical/dimension
    if ((lower === 'year' || lower === 'yr') && distinctCount < 50) {
      return ColumnType.CATEGORICAL;
    }

    return ColumnType.NUMERIC;
  }

  // For VARCHAR/TEXT types
  if (totalRows === 0) {
    return ColumnType.TEXT;
  }

  // Check ID pattern on text
  if (isIdPattern && cardinalityRatio > 0.7) {
    return ColumnType.IDENTIFIER;
  }

  // High cardinality (>90% unique) → likely an identifier or unique text
  if (cardinalityRatio > 0.9 && totalRows > 20) {
    return ColumnType.IDENTIFIER;
  }

  // Low cardinality (<60 distinct values or <20% of rows) → categorical
  if (distinctCount <= 60 || cardinalityRatio < 0.2) {
    return ColumnType.CATEGORICAL;
  }

  // Default to text for everything else
  return ColumnType.TEXT;
}

/**
 * Returns numeric columns sorted by business metric relevance.
 * High-impact metrics (Revenue, Profit, Sales, Volume, Quantity, Price, Score) appear first.
 */
export function getPrioritizedNumericColumns(schema: TableSchema): ColumnMetadata[] {
  const numerics = schema.columns.filter(c => c.detectedType === ColumnType.NUMERIC);

  const PRIORITY_KEYWORDS = [
    'revenue', 'sales', 'profit', 'margin', 'amount', 'total', 'price',
    'cost', 'volume', 'quantity', 'units', 'spend', 'discount',
    'score', 'rating', 'salary', 'income', 'balance', 'value', 'rate'
  ];

  return [...numerics].sort((a, b) => {
    const aLower = a.name.toLowerCase();
    const bLower = b.name.toLowerCase();

    const aScore = PRIORITY_KEYWORDS.findIndex(k => aLower.includes(k));
    const bScore = PRIORITY_KEYWORDS.findIndex(k => bLower.includes(k));

    const aRank = aScore !== -1 ? aScore : 999;
    const bRank = bScore !== -1 ? bScore : 999;

    return aRank - bRank;
  });
}

/**
 * Returns categorical columns sorted by analytical clarity.
 * Columns with 3–30 distinct values (e.g. Region, Segment, Category, Department) appear first.
 */
export function getPrioritizedCategoricalColumns(schema: TableSchema): ColumnMetadata[] {
  const categoricals = schema.columns.filter(c => c.detectedType === ColumnType.CATEGORICAL);

  const PRIORITY_CATEGORIES = [
    'category', 'segment', 'region', 'department', 'type', 'status',
    'country', 'state', 'channel', 'brand', 'tier', 'group', 'genre'
  ];

  return [...categoricals].sort((a, b) => {
    const aLower = a.name.toLowerCase();
    const bLower = b.name.toLowerCase();

    const aKeyword = PRIORITY_CATEGORIES.findIndex(k => aLower.includes(k));
    const bKeyword = PRIORITY_CATEGORIES.findIndex(k => bLower.includes(k));

    const aRank = aKeyword !== -1 ? aKeyword : 999;
    const bRank = bKeyword !== -1 ? bKeyword : 999;

    if (aRank !== bRank) return aRank - bRank;

    // Favor columns with 3 to 25 distinct values (ideal for charts)
    const aIdeal = a.distinctCount >= 3 && a.distinctCount <= 25 ? 0 : 1;
    const bIdeal = b.distinctCount >= 3 && b.distinctCount <= 25 ? 0 : 1;

    return aIdeal - bIdeal;
  });
}
