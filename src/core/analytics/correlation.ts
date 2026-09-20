import { TableSchema } from '../schema/schemaTypes.js';
import { ActiveFilter } from './filterTypes.js';
import { getPrioritizedNumericColumns } from '../schema/typeDetector.js';

type QueryFunction = (sql: string) => Promise<any[]>;

export interface ScatterPoint {
  x: number;
  y: number;
}

export interface CorrelationResult {
  column1: string;
  column2: string;
  correlation: number;
  points: ScatterPoint[];
}

/**
 * Computes Pearson correlation coefficient between two numeric columns and extracts sample points for scatter visualization.
 */
export async function runCorrelation(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction,
  filter?: ActiveFilter
): Promise<CorrelationResult> {
  const numericColumns = getPrioritizedNumericColumns(schema);

  if (numericColumns.length < 2) {
    throw new Error('correlation analysis requires at least two numeric columns');
  }

  const col1 = numericColumns[0].name;
  const col2 = numericColumns[1].name;

  const esc1 = `"${col1.replace(/"/g, '""')}"`;
  const esc2 = `"${col2.replace(/"/g, '""')}"`;

  const filterClause = filter 
    ? `AND "${filter.column.replace(/"/g, '""')}" = '${String(filter.value).replace(/'/g, "''")}'` 
    : '';

  // Compute Pearson correlation coefficient
  const corrRows = await queryFn(`
    SELECT
      ROUND(COALESCE(CORR(${esc1}, ${esc2}), 0), 4) AS corr_coef
    FROM ${tableName}
    WHERE ${esc1} IS NOT NULL AND ${esc2} IS NOT NULL
      ${filterClause}
  `);

  const correlation = Number(corrRows[0]?.corr_coef ?? 0);

  // Extract up to 200 scatter points
  const pointRows = await queryFn(`
    SELECT
      ${esc1} AS x,
      ${esc2} AS y
    FROM ${tableName}
    WHERE ${esc1} IS NOT NULL AND ${esc2} IS NOT NULL
      ${filterClause}
    LIMIT 200
  `);

  const points: ScatterPoint[] = pointRows.map(r => ({
    x: Number(r.x),
    y: Number(r.y),
  }));

  return {
    column1: col1,
    column2: col2,
    correlation,
    points,
  };
}
