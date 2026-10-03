import { TableSchema, ColumnType } from '../schema/schemaTypes.js';
import { ActiveFilter } from './filterTypes.js';
import { getPrioritizedCategoricalColumns, getPrioritizedNumericColumns } from '../schema/typeDetector.js';

type QueryFunction = (sql: string) => Promise<any[]>;

export interface GroupAggregationRow {
  category: string;
  avg_value: number;
  sum_value: number;
  count: number;
}

export interface GroupAggregationResult {
  categoryColumn: string;
  numericColumn: string;
  /** 'agg' = avg/sum of numeric; 'count' = count-based (cat×cat or cat×date) */
  mode: 'agg' | 'count';
  rows: GroupAggregationRow[];
}

function isDateLike(name: string): boolean {
  return /year|date|time|month|quarter|period/i.test(name);
}

function buildFilter(filter?: ActiveFilter): string {
  if (!filter) return '';
  return `AND "${filter.column.replace(/"/g, '""')}" = '${String(filter.value).replace(/'/g, "''")}'`;
}

/**
 * Returns multiple group-aggregation charts:
 * - Top 6 meaningful (categorical × numeric) pairs  → avg metric by group
 * - Top 3 (categorical × categorical) pairs         → count cross-tab
 * Year/date columns are only used as the GROUP-BY axis (never averaged).
 */
export async function runGroupAggregation(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction,
  filter?: ActiveFilter
): Promise<GroupAggregationResult[]> {
  const catCols = getPrioritizedCategoricalColumns(schema);
  const numericCols = getPrioritizedNumericColumns(schema);
  // Date-like cols treated as axis, never as a numeric measure to average
  const dateCols = schema.columns.filter(c => c.detectedType === ColumnType.DATE);

  const filterClause = buildFilter(filter);
  const results: GroupAggregationResult[] = [];

  // ── 1. Numeric × Categorical (avg metric by group) ─────────────────────────
  // Exclude binary columns (0/1 outcomes like LeaveOrNot) as measures
  const measureCols = numericCols.filter(c => {
    const nm = c.name.toLowerCase();
    return !isDateLike(nm) && !/^(id|uuid|index|row|leave|churn|attrition)/i.test(nm);
  });

  let pairsGenerated = 0;
  for (const num of measureCols) {
    for (const cat of catCols) {
      if (pairsGenerated >= 6) break;
      // Skip if cat is a date-like column — handle those separately
      if (isDateLike(cat.name)) continue;

      const catEsc = `"${cat.name.replace(/"/g, '""')}"`;
      const numEsc = `"${num.name.replace(/"/g, '""')}"`;

      try {
        const rows = await queryFn(`
          SELECT
            CAST(${catEsc} AS VARCHAR) AS category,
            ROUND(AVG(TRY_CAST(${numEsc} AS DOUBLE)), 4) AS avg_value,
            ROUND(SUM(TRY_CAST(${numEsc} AS DOUBLE)), 4) AS sum_value,
            COUNT(*) AS count
          FROM ${tableName}
          WHERE ${catEsc} IS NOT NULL AND ${numEsc} IS NOT NULL
            ${filterClause}
          GROUP BY ${catEsc}
          ORDER BY avg_value DESC
          LIMIT 15
        `);
        if (rows.length > 1) {
          results.push({
            categoryColumn: cat.name,
            numericColumn: num.name,
            mode: 'agg',
            rows: rows.map(r => ({
              category: String(r.category),
              avg_value: Number(r.avg_value),
              sum_value: Number(r.sum_value),
              count: Number(r.count),
            })),
          });
          pairsGenerated++;
        }
      } catch { /* skip bad pairs silently */ }
    }
    if (pairsGenerated >= 6) break;
  }

  // ── 2. Date axis × count (Employee Count by JoiningYear, etc.) ─────────────
  for (const date of dateCols) {
    const dateEsc = `"${date.name.replace(/"/g, '""')}"`;
    try {
      const rows = await queryFn(`
        SELECT
          CAST(${dateEsc} AS VARCHAR) AS category,
          COUNT(*) AS count,
          COUNT(*) AS avg_value,
          COUNT(*) AS sum_value
        FROM ${tableName}
        WHERE ${dateEsc} IS NOT NULL
          ${filterClause}
        GROUP BY ${dateEsc}
        ORDER BY category ASC
        LIMIT 20
      `);
      if (rows.length > 1) {
        results.push({
          categoryColumn: date.name,
          numericColumn: 'Count',
          mode: 'count',
          rows: rows.map(r => ({
            category: String(r.category),
            avg_value: Number(r.count),
            sum_value: Number(r.count),
            count: Number(r.count),
          })),
        });
      }
    } catch { /* skip */ }
  }

  // ── 3. Categorical × Categorical (count cross-tab) ──────────────────────────
  let catPairs = 0;
  for (let i = 0; i < catCols.length && catPairs < 3; i++) {
    for (let j = i + 1; j < catCols.length && catPairs < 3; j++) {
      const cat1 = catCols[i];
      const cat2 = catCols[j];
      if (isDateLike(cat1.name) || isDateLike(cat2.name)) continue;
      const c1Esc = `"${cat1.name.replace(/"/g, '""')}"`;
      const c2Esc = `"${cat2.name.replace(/"/g, '""')}"`;
      try {
        const rows = await queryFn(`
          SELECT
            CAST(${c1Esc} AS VARCHAR) AS category,
            COUNT(*) AS count,
            COUNT(*) AS avg_value,
            COUNT(*) AS sum_value
          FROM ${tableName}
          WHERE ${c1Esc} IS NOT NULL AND ${c2Esc} IS NOT NULL
            ${filterClause}
          GROUP BY ${c1Esc}
          ORDER BY count DESC
          LIMIT 15
        `);
        if (rows.length > 1) {
          results.push({
            categoryColumn: cat1.name,
            numericColumn: `Count by ${cat2.name}`,
            mode: 'count',
            rows: rows.map(r => ({
              category: String(r.category),
              avg_value: Number(r.count),
              sum_value: Number(r.count),
              count: Number(r.count),
            })),
          });
          catPairs++;
        }
      } catch { /* skip */ }
    }
  }

  if (results.length === 0) {
    throw new Error('group_aggregation: no meaningful column pairs found');
  }

  return results;
}
