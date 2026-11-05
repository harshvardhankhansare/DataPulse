import { TableSchema } from '../schema/schemaTypes.js';
import { ActiveFilter } from './filterTypes.js';
import { getPrioritizedNumericColumns } from '../schema/typeDetector.js';

type QueryFunction = (sql: string) => Promise<unknown[]>;

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

function isDateLike(name: string): boolean {
  return /year|date|time|month|quarter|period/i.test(name);
}

function buildFilter(filter?: ActiveFilter): string {
  if (!filter) return '';
  return `AND "${filter.column.replace(/"/g, '""')}" = '${String(filter.value).replace(/'/g, "''")}'`;
}

/**
 * Returns up to 4 scatter charts for the most strongly-correlated numeric pairs.
 * Year/date-like columns are excluded from correlation analysis.
 */
export async function runCorrelation(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction,
  filter?: ActiveFilter
): Promise<CorrelationResult[]> {
  const numericColumns = getPrioritizedNumericColumns(schema).filter(
    c => !isDateLike(c.name)
  );

  if (numericColumns.length < 2) {
    throw new Error('correlation analysis requires at least two non-date numeric columns');
  }

  const filterClause = buildFilter(filter);

  // Build all unique pairs, compute correlation, take top-4 by |r|
  const pairCorrelations: { col1: string; col2: string; corr: number }[] = [];

  for (let i = 0; i < numericColumns.length; i++) {
    for (let j = i + 1; j < numericColumns.length; j++) {
      const col1 = numericColumns[i].name;
      const col2 = numericColumns[j].name;
      const esc1 = `"${col1.replace(/"/g, '""')}"`;
      const esc2 = `"${col2.replace(/"/g, '""')}"`;
      try {
        const corrRows = await queryFn(`
          SELECT ROUND(COALESCE(CORR(TRY_CAST(${esc1} AS DOUBLE), TRY_CAST(${esc2} AS DOUBLE)), 0), 4) AS corr_coef
          FROM ${tableName}
          WHERE ${esc1} IS NOT NULL AND ${esc2} IS NOT NULL
            ${filterClause}
        `) as { corr_coef: number }[];
        const corr = Number(corrRows[0]?.corr_coef ?? 0);
        pairCorrelations.push({ col1, col2, corr });
      } catch { /* skip bad pair */ }
    }
  }

  // Sort by absolute correlation descending, take top 4
  pairCorrelations.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
  const topPairs = pairCorrelations.slice(0, 4);

  const results: CorrelationResult[] = [];
  for (const pair of topPairs) {
    const esc1 = `"${pair.col1.replace(/"/g, '""')}"`;
    const esc2 = `"${pair.col2.replace(/"/g, '""')}"`;
    try {
      const pointRows = await queryFn(`
        SELECT
          TRY_CAST(${esc1} AS DOUBLE) AS x,
          TRY_CAST(${esc2} AS DOUBLE) AS y
        FROM ${tableName}
        WHERE ${esc1} IS NOT NULL AND ${esc2} IS NOT NULL
          ${filterClause}
        LIMIT 200
      `) as { x: number; y: number }[];
      results.push({
        column1: pair.col1,
        column2: pair.col2,
        correlation: pair.corr,
        points: pointRows.map(r => ({ x: Number(r.x), y: Number(r.y) })),
      });
    } catch { /* skip */ }
  }

  if (results.length === 0) {
    throw new Error('correlation: could not compute any numeric pair');
  }

  return results;
}
