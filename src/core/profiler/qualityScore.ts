import { TableSchema, ColumnType } from '../schema/schemaTypes.js';
import { QualityReport, QualityIssue } from './profilerTypes.js';

type QueryFunction = (sql: string) => Promise<any[]>;

function toNumber(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

/**
 * Profile data quality across 4 dimensions and detect issues
 * @param tableName - Name of the table to profile
 * @param schema - Detected schema from type detector
 * @param queryFn - Query function from DuckDB connection
 * @returns Quality report with scores and issues
 */
export async function profileQuality(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction
): Promise<QualityReport> {
  // Calculate four quality dimensions
  const completeness = calculateCompleteness(schema);
  const uniqueness = await calculateUniqueness(tableName, schema, queryFn);
  const validity = await calculateValidity(tableName, schema, queryFn);
  const consistency = await calculateConsistency(tableName, schema, queryFn);

  // Aggregate overall score
  const overallScore = (completeness + uniqueness + validity + consistency) / 4;

  // Detect issues
  const issues = await detectIssues(tableName, schema, queryFn);

  return {
    overallScore,
    completeness,
    uniqueness,
    validity,
    consistency,
    issues
  };
}

/**
 * Calculate completeness: proportion of non-null values
 */
function calculateCompleteness(schema: TableSchema): number {
  const totalCells = schema.columns.reduce((sum, col) => sum + col.totalRows, 0);
  const nullCells = schema.columns.reduce((sum, col) => sum + col.nullCount, 0);

  if (totalCells === 0) return 1.0;

  return (totalCells - nullCells) / totalCells;
}

/**
 * Calculate uniqueness: average distinct ratio minus duplicate row penalty
 */
async function calculateUniqueness(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction
): Promise<number> {
  if (schema.columns.length === 0) return 1.0;

  // Average distinct ratio across columns
  const avgDistinctRatio = schema.columns.reduce((sum, col) => {
    const ratio = col.totalRows > 0 ? col.distinctCount / col.totalRows : 1;
    return sum + ratio;
  }, 0) / schema.columns.length;

  // Check for duplicate rows
  const result = await queryFn(`
    SELECT
      (SELECT COUNT(*) FROM ${tableName}) as total,
      (SELECT COUNT(*) FROM (SELECT DISTINCT * FROM ${tableName})) as distinct_rows
  `);

  const totalRows = toNumber(result[0]?.total);
  const distinctRows = toNumber(result[0]?.distinct_rows);
  const duplicateCount = totalRows - distinctRows;
  const duplicatePenalty = totalRows > 0 ? duplicateCount / totalRows : 0;

  return Math.max(0, avgDistinctRatio * (1 - duplicatePenalty));
}

/**
 * Calculate validity: proportion of values conforming to expected formats
 */
async function calculateValidity(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction
): Promise<number> {
  const validityScores: number[] = [];

  for (const column of schema.columns) {
    let colValidity = 1.0; // Default: all valid

    if (column.detectedType === ColumnType.NUMERIC) {
      colValidity = await checkNumericValidity(tableName, column.name, queryFn);
    } else if (column.detectedType === ColumnType.DATE) {
      colValidity = await checkDateValidity(tableName, column.name, queryFn);
    }
    // Other types default to 1.0 (valid)

    validityScores.push(colValidity);
  }

  return validityScores.length > 0
    ? validityScores.reduce((sum, score) => sum + score, 0) / validityScores.length
    : 1.0;
}

/**
 * Check numeric validity using IQR outlier detection
 */
async function checkNumericValidity(
  tableName: string,
  columnName: string,
  queryFn: QueryFunction
): Promise<number> {
  try {
    // Count non-null values first - skip IQR if too few rows
    const countRes = await queryFn(`
      SELECT COUNT("${columnName}") as non_null_count
      FROM ${tableName}
    `);
    const nonNullCount = toNumber(countRes[0]?.non_null_count ?? 0);
    if (nonNullCount < 4) return 1.0; // Not enough data to assess validity

    const result = await queryFn(`
      WITH stats AS (
        SELECT
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY "${columnName}") as q1,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "${columnName}") as q3,
          COUNT("${columnName}") as non_null_count
        FROM ${tableName}
      ),
      bounds AS (
        SELECT
          q1,
          q3,
          CASE WHEN (q3 - q1) = 0
            THEN q1 - 1
            ELSE q1 - 3 * (q3 - q1)
          END as lower_bound,
          CASE WHEN (q3 - q1) = 0
            THEN q3 + 1
            ELSE q3 + 3 * (q3 - q1)
          END as upper_bound,
          non_null_count
        FROM stats
      )
      SELECT COALESCE(
        AVG(CASE WHEN "${columnName}" >= lower_bound AND "${columnName}" <= upper_bound
                 THEN 1.0 ELSE 0.0 END),
        1.0
      ) as validity
      FROM ${tableName}
      CROSS JOIN bounds
      WHERE "${columnName}" IS NOT NULL
    `);

    return Number(result[0]?.validity ?? 1.0);
  } catch {
    // If query fails, default to valid
    return 1.0;
  }
}

/**
 * Check date validity (reasonable range 1900-2100)
 */
async function checkDateValidity(
  tableName: string,
  columnName: string,
  queryFn: QueryFunction
): Promise<number> {
  try {
    const result = await queryFn(`
      SELECT
        COUNT(CASE WHEN "${columnName}" >= '1900-01-01' AND "${columnName}" <= '2100-12-31'
                   THEN 1 END) * 1.0 / GREATEST(COUNT("${columnName}"), 1) as validity
      FROM ${tableName}
      WHERE "${columnName}" IS NOT NULL
    `);

    return Number(result[0]?.validity ?? 1.0);
  } catch {
    return 1.0;
  }
}

/**
 * Calculate consistency: format uniformity (simplified for Phase 2)
 */
async function calculateConsistency(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction
): Promise<number> {
  const consistencyScores: number[] = [];

  for (const column of schema.columns) {
    if (column.detectedType === ColumnType.NUMERIC) {
      // Check if all integers or all decimals (consistent precision)
      try {
        const result = await queryFn(`
          SELECT
            COUNT(CASE WHEN "${column.name}" = FLOOR("${column.name}") THEN 1 END) * 1.0 /
            GREATEST(COUNT("${column.name}"), 1) as integer_ratio
          FROM ${tableName}
          WHERE "${column.name}" IS NOT NULL
        `);

        const integerRatio = Number(result[0]?.integer_ratio ?? 0.5);
        // High consistency if mostly integers OR mostly decimals
        const score = Math.max(integerRatio, 1 - integerRatio);
        consistencyScores.push(score);
      } catch {
        consistencyScores.push(1.0);
      }
    } else {
      // For other types, assume consistent (placeholder for Phase 2)
      consistencyScores.push(1.0);
    }
  }

  return consistencyScores.length > 0
    ? consistencyScores.reduce((sum, s) => sum + s, 0) / consistencyScores.length
    : 1.0;
}

/**
 * Detect data quality issues
 */
async function detectIssues(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction
): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = [];

  // Check for missing values
  for (const column of schema.columns) {
    const missingPct = column.totalRows > 0 ? (column.nullCount / column.totalRows) * 100 : 0;

    if (missingPct > 50) {
      issues.push({
        severity: 'high',
        column: column.name,
        issueType: 'missing_values',
        description: `Column "${column.name}" has ${missingPct.toFixed(1)}% missing values`,
        affectedCount: column.nullCount,
        suggestion: 'Consider removing this column or imputing missing values'
      });
    } else if (missingPct > 20) {
      issues.push({
        severity: 'medium',
        column: column.name,
        issueType: 'missing_values',
        description: `Column "${column.name}" has ${missingPct.toFixed(1)}% missing values`,
        affectedCount: column.nullCount,
        suggestion: 'Some analyses may exclude rows with missing values'
      });
    }
  }

  // Check for duplicate rows
  try {
    const result = await queryFn(`
      SELECT
        (SELECT COUNT(*) FROM ${tableName}) as total,
        (SELECT COUNT(*) FROM (SELECT DISTINCT * FROM ${tableName})) as distinct_rows
    `);

    const totalRows = toNumber(result[0]?.total);
    const distinctRows = toNumber(result[0]?.distinct_rows);
    const duplicateCount = totalRows - distinctRows;
    const duplicatePct = totalRows > 0 ? (duplicateCount / totalRows) * 100 : 0;

    if (duplicateCount > 0) {
      const severity = duplicatePct > 20 ? 'high' : duplicatePct > 5 ? 'medium' : 'low';

      issues.push({
        severity,
        column: '',
        issueType: 'duplicate_rows',
        description: `${duplicateCount} duplicate rows found (${duplicatePct.toFixed(1)}% of dataset)`,
        affectedCount: duplicateCount,
        suggestion: 'Review data source for import errors or intentional duplicates'
      });
    }
  } catch {
    // Ignore errors in duplicate detection
  }

  // Check for outliers in numeric columns
  for (const column of schema.columns) {
    if (column.detectedType === ColumnType.NUMERIC) {
      try {
        const nonNullCount = column.totalRows - column.nullCount;
        if (nonNullCount < 4) continue; // Skip outlier check for tiny samples

        const result = await queryFn(`
          WITH stats AS (
            SELECT
              PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY "${column.name}") as q1,
              PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "${column.name}") as q3
            FROM ${tableName}
            WHERE "${column.name}" IS NOT NULL
          ),
          bounds AS (
            SELECT
              CASE WHEN (q3 - q1) = 0 THEN q1 - 1 ELSE q1 - 3 * (q3 - q1) END as lower_bound,
              CASE WHEN (q3 - q1) = 0 THEN q3 + 1 ELSE q3 + 3 * (q3 - q1) END as upper_bound
            FROM stats
          )
          SELECT COUNT(*) as outlier_count
          FROM ${tableName}
          CROSS JOIN bounds
          WHERE "${column.name}" < lower_bound OR "${column.name}" > upper_bound
        `);

        const outlierCount = toNumber(result[0]?.outlier_count);
        const outlierPct = nonNullCount > 0 ? (outlierCount / nonNullCount) * 100 : 0;

        if (outlierCount > 0 && outlierPct > 5) {
          const severity = outlierPct > 10 ? 'medium' : 'low';

          issues.push({
            severity,
            column: column.name,
            issueType: 'outliers',
            description: `Column "${column.name}" has ${outlierCount} outliers (${outlierPct.toFixed(1)}%)`,
            affectedCount: outlierCount,
            suggestion: 'Review outliers to determine if they are errors or genuine extreme values'
          });
        }
      } catch {
        // Ignore errors in outlier detection
      }
    }
  }

  return issues;
}
