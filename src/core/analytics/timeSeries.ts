import { TableSchema, ColumnType } from '../schema/schemaTypes.js';
import { ActiveFilter } from './filterTypes.js';
import { getPrioritizedNumericColumns } from '../schema/typeDetector.js';

type QueryFunction = (sql: string) => Promise<any[]>;

export interface TimeSeriesPoint {
  period: string;
  value: number;
}

export interface TimeSeriesResult {
  dateColumn: string;
  numericColumn: string;
  /** 'count' = row count per period; 'avg' = average of a measure per period */
  mode: 'count' | 'avg';
  points: TimeSeriesPoint[];
}

function isDateLike(name: string): boolean {
  return /year|date|time|month|quarter|period/i.test(name);
}

function buildFilter(filter?: ActiveFilter): string {
  if (!filter) return '';
  return `AND "${filter.column.replace(/"/g, '""')}" = '${String(filter.value).replace(/'/g, "''")}'`;
}

/**
 * Returns multiple time-series charts:
 * - One COUNT chart per date column (Employee Count by JoiningYear, etc.)
 * - Avg metric over time for top-3 (date × numeric) pairs
 * NEVER averages date/year columns.
 */
export async function runTimeSeries(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction,
  filter?: ActiveFilter
): Promise<TimeSeriesResult[]> {
  const dateCols = schema.columns.filter(c => c.detectedType === ColumnType.DATE);
  const numericCols = getPrioritizedNumericColumns(schema).filter(c => !isDateLike(c.name));
  const filterClause = buildFilter(filter);

  if (dateCols.length === 0) {
    throw new Error('time_series: no date/year columns found');
  }

  const results: TimeSeriesResult[] = [];

  for (const dateCol of dateCols) {
    const dateEsc = `"${dateCol.name.replace(/"/g, '""')}"`;

    // ── Count chart ────────────────────────────────────────────────────────────
    try {
      const rows = await queryFn(`
        SELECT
          CAST(${dateEsc} AS VARCHAR) AS period,
          COUNT(*) AS val
        FROM ${tableName}
        WHERE ${dateEsc} IS NOT NULL
          ${filterClause}
        GROUP BY ${dateEsc}
        ORDER BY period ASC
        LIMIT 50
      `);
      const points = rows
        .filter(r => r.period !== null && r.period !== 'null')
        .map(r => ({ period: String(r.period), value: Number(r.val) }));
      if (points.length > 1) {
        results.push({ dateColumn: dateCol.name, numericColumn: 'Count', mode: 'count', points });
      }
    } catch { /* skip */ }

    // ── Avg metric over time (up to 3 numeric cols) ────────────────────────────
    let avgCharts = 0;
    for (const numCol of numericCols) {
      if (avgCharts >= 3) break;
      const numEsc = `"${numCol.name.replace(/"/g, '""')}"`;
      try {
        const rows = await queryFn(`
          SELECT
            CAST(${dateEsc} AS VARCHAR) AS period,
            ROUND(AVG(TRY_CAST(${numEsc} AS DOUBLE)), 4) AS val
          FROM ${tableName}
          WHERE ${dateEsc} IS NOT NULL AND ${numEsc} IS NOT NULL
            ${filterClause}
          GROUP BY ${dateEsc}
          ORDER BY period ASC
          LIMIT 50
        `);
        const points = rows
          .filter(r => r.period !== null && r.period !== 'null')
          .map(r => ({ period: String(r.period), value: Number(r.val) }));
        if (points.length > 1) {
          results.push({ dateColumn: dateCol.name, numericColumn: numCol.name, mode: 'avg', points });
          avgCharts++;
        }
      } catch { /* skip */ }
    }
  }

  if (results.length === 0) {
    throw new Error('time_series: no usable date × metric pairs found');
  }

  return results;
}
