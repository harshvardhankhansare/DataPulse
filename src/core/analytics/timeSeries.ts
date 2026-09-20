import { TableSchema, ColumnType } from '../schema/schemaTypes.js';
import { ActiveFilter } from './filterTypes.js';

type QueryFunction = (sql: string) => Promise<any[]>;

export interface TimeSeriesPoint {
  period: string;
  value: number;
}

export interface TimeSeriesResult {
  dateColumn: string;
  numericColumn: string;
  points: TimeSeriesPoint[];
}

/**
 * Computes time-series trend by aggregating metric values by date chronologically.
 */
export async function runTimeSeries(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction,
  filter?: ActiveFilter
): Promise<TimeSeriesResult> {
  const dateCol = schema.columns.find(c => c.detectedType === ColumnType.DATE);
  const numerics = schema.columns.filter(c => c.detectedType === ColumnType.NUMERIC);
  const numCol = numerics.find(c => !c.name.toLowerCase().endsWith('_id') && c.name.toLowerCase() !== 'id') || numerics[0];

  if (!dateCol || !numCol) {
    throw new Error('time_series analysis requires at least one date column and one numeric column');
  }

  const dateEsc = `"${dateCol.name.replace(/"/g, '""')}"`;
  const numEsc = `"${numCol.name.replace(/"/g, '""')}"`;

  const filterClause = filter 
    ? `AND "${filter.column.replace(/"/g, '""')}" = '${String(filter.value).replace(/'/g, "''")}'` 
    : '';

  const rows = await queryFn(`
    SELECT
      CAST(strftime(TRY_CAST(${dateEsc} AS TIMESTAMP), '%Y-%m-%d') AS VARCHAR) AS period,
      ROUND(AVG(${numEsc}), 4) AS avg_value
    FROM ${tableName}
    WHERE ${dateEsc} IS NOT NULL AND ${numEsc} IS NOT NULL
      ${filterClause}
    GROUP BY 1
    ORDER BY period ASC
    LIMIT 100
  `);

  const points: TimeSeriesPoint[] = rows
    .filter(r => r.period !== null && r.period !== 'null')
    .map(r => ({
      period: String(r.period),
      value: Number(r.avg_value),
    }));

  return {
    dateColumn: dateCol.name,
    numericColumn: numCol.name,
    points,
  };
}
