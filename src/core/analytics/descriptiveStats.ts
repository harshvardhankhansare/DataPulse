import { TableSchema } from '../schema/schemaTypes.js';
import { ActiveFilter } from './filterTypes.js';
import { getPrioritizedNumericColumns } from '../schema/typeDetector.js';

type QueryFunction = (sql: string) => Promise<any[]>;

export interface NumericStats {
  column: string;
  count: number;
  nullCount: number;
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
}

export interface HistogramBin {
  binRange: string;
  min: number;
  max: number;
  count: number;
}

export interface DescriptiveStatsResult {
  stats: NumericStats;
  histogram: HistogramBin[];
}

/**
 * Computes descriptive statistics and histogram distribution for the primary numeric column.
 */
export async function runDescriptiveStats(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction,
  filter?: ActiveFilter
): Promise<DescriptiveStatsResult> {
  const numerics = getPrioritizedNumericColumns(schema);
  const numCol = numerics[0];

  if (!numCol) {
    throw new Error('descriptive_stats requires at least one numeric column');
  }

  const colName = numCol.name;
  const escapedCol = `"${colName.replace(/"/g, '""')}"`;

  const filterWhere = filter 
    ? `WHERE "${filter.column.replace(/"/g, '""')}" = '${String(filter.value).replace(/'/g, "''")}'` 
    : '';
  const filterAnd = filter 
    ? `AND "${filter.column.replace(/"/g, '""')}" = '${String(filter.value).replace(/'/g, "''")}'` 
    : '';

  // Compute summary stats
  const statsRows = await queryFn(`
    SELECT
      '${colName.replace(/'/g, "''")}' AS column,
      COUNT(*) AS total_count,
      COUNT(*) - COUNT(${escapedCol}) AS null_count,
      ROUND(COALESCE(AVG(${escapedCol}), 0), 4) AS mean,
      ROUND(COALESCE(MEDIAN(${escapedCol}), 0), 4) AS median,
      ROUND(COALESCE(STDDEV_SAMP(${escapedCol}), 0), 4) AS stddev,
      ROUND(COALESCE(MIN(${escapedCol}), 0), 4) AS min_val,
      ROUND(COALESCE(MAX(${escapedCol}), 0), 4) AS max_val,
      ROUND(COALESCE(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ${escapedCol}), 0), 4) AS q1,
      ROUND(COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${escapedCol}), 0), 4) AS q3
    FROM ${tableName}
    ${filterWhere}
  `);

  const rawStats = statsRows[0] || {};
  const stats: NumericStats = {
    column: colName,
    count: Number(rawStats.total_count || 0),
    nullCount: Number(rawStats.null_count || 0),
    mean: Number(rawStats.mean || 0),
    median: Number(rawStats.median || 0),
    stddev: Number(rawStats.stddev || 0),
    min: Number(rawStats.min_val || 0),
    max: Number(rawStats.max_val || 0),
    q1: Number(rawStats.q1 || 0),
    q3: Number(rawStats.q3 || 0),
  };

  // Generate 5-10 equal-width histogram bins
  const binCount = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(stats.count))));
  const range = stats.max - stats.min;
  const binWidth = range > 0 ? range / binCount : 1;

  const histogram: HistogramBin[] = [];

  if (range === 0 || stats.count === 0) {
    histogram.push({
      binRange: `${stats.min}`,
      min: stats.min,
      max: stats.max,
      count: stats.count - stats.nullCount,
    });
  } else {
    // Generate bins with DuckDB width_bucket
    const binRows = await queryFn(`
      SELECT
        FLOOR((${escapedCol} - ${stats.min}) / ${binWidth}) AS bin_idx,
        COUNT(*) AS bin_count
      FROM ${tableName}
      WHERE ${escapedCol} IS NOT NULL
        ${filterAnd}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    const binCountMap = new Map<number, number>();
    for (const r of binRows) {
      const idx = Math.min(binCount - 1, Math.max(0, Number(r.bin_idx)));
      binCountMap.set(idx, (binCountMap.get(idx) || 0) + Number(r.bin_count));
    }

    for (let i = 0; i < binCount; i++) {
      const bMin = stats.min + i * binWidth;
      const bMax = i === binCount - 1 ? stats.max : stats.min + (i + 1) * binWidth;
      const label = `${bMin.toFixed(1)} - ${bMax.toFixed(1)}`;
      histogram.push({
        binRange: label,
        min: Number(bMin.toFixed(2)),
        max: Number(bMax.toFixed(2)),
        count: binCountMap.get(i) || 0,
      });
    }
  }

  return { stats, histogram };
}
