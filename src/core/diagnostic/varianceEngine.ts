import { TableSchema, ColumnType } from '../schema/schemaTypes.js';
import { VarianceDriver, ImpactType } from './diagnosticTypes.js';

type QueryFunction = (sql: string) => Promise<any[]>;

export interface VarianceDecompositionResult {
  targetMetric: string;
  dimension: string;
  baselineName: string;
  comparisonName: string;
  totalBaseline: number;
  totalComparison: number;
  netDelta: number;
  netPercentageChange: number;
  drivers: VarianceDriver[];
}

export async function computeVarianceDecomposition(
  tableName: string,
  schema: TableSchema,
  targetMetric: string,
  dimension: string,
  queryFn: QueryFunction
): Promise<VarianceDecompositionResult> {
  const escTable = `"${tableName.replace(/"/g, '""')}"`;
  const escTarget = `"${targetMetric.replace(/"/g, '""')}"`;
  const escDim = `"${dimension.replace(/"/g, '""')}"`;

  // Find date column if available for chronological sorting
  const dateCol = schema.columns.find(c => c.detectedType === ColumnType.DATE);
  const orderClause = dateCol ? `ORDER BY "${dateCol.name.replace(/"/g, '""')}" ASC` : '';

  const baselineName = dateCol ? 'Historical Baseline (H1)' : 'Baseline Cohort (H1)';
  const comparisonName = dateCol ? 'Recent Period (H2)' : 'Recent Cohort (H2)';

  // Query DuckDB using window partitioning to compute baseline vs comparison for each segment
  const sql = `
    WITH ranked AS (
      SELECT 
        ${escDim} AS dim_val,
        CAST(${escTarget} AS DOUBLE) AS target_val,
        ROW_NUMBER() OVER (${orderClause}) AS rn,
        COUNT(*) OVER () AS total_cnt
      FROM ${escTable}
      WHERE ${escDim} IS NOT NULL AND ${escTarget} IS NOT NULL
    )
    SELECT 
      dim_val,
      COALESCE(SUM(CASE WHEN rn <= total_cnt / 2 THEN target_val ELSE 0 END), 0) AS baseline_val,
      COALESCE(SUM(CASE WHEN rn > total_cnt / 2 THEN target_val ELSE 0 END), 0) AS comp_val
    FROM ranked
    GROUP BY dim_val
    ORDER BY ABS(COALESCE(SUM(CASE WHEN rn > total_cnt / 2 THEN target_val ELSE 0 END), 0) - 
                 COALESCE(SUM(CASE WHEN rn <= total_cnt / 2 THEN target_val ELSE 0 END), 0)) DESC
    LIMIT 15;
  `;

  const rows = await queryFn(sql);

  let totalBaseline = 0;
  let totalComparison = 0;
  let totalAbsDelta = 0;

  const rawDrivers: {
    name: string;
    baselineValue: number;
    comparisonValue: number;
    absoluteDelta: number;
    percentageChange: number;
  }[] = [];

  for (const r of rows) {
    const name = String(r.dim_val);
    const bVal = Number(r.baseline_val || 0);
    const cVal = Number(r.comp_val || 0);
    const delta = cVal - bVal;
    const pctChange = bVal !== 0 ? (delta / Math.abs(bVal)) * 100 : delta > 0 ? 100 : 0;

    totalBaseline += bVal;
    totalComparison += cVal;
    totalAbsDelta += Math.abs(delta);

    rawDrivers.push({
      name,
      baselineValue: Math.round(bVal * 100) / 100,
      comparisonValue: Math.round(cVal * 100) / 100,
      absoluteDelta: Math.round(delta * 100) / 100,
      percentageChange: Math.round(pctChange * 10) / 10,
    });
  }

  const netDelta = totalComparison - totalBaseline;
  const netPercentageChange =
    totalBaseline !== 0
      ? (netDelta / Math.abs(totalBaseline)) * 100
      : netDelta > 0
      ? 100
      : 0;

  // Calculate percentage contribution to variance
  const drivers: VarianceDriver[] = rawDrivers.map(d => {
    const contributionPct =
      totalAbsDelta > 0 ? Math.round((Math.abs(d.absoluteDelta) / totalAbsDelta) * 1000) / 10 : 0;

    let impact: ImpactType = 'neutral';
    if (d.absoluteDelta < 0) {
      impact = 'drag';
    } else if (d.absoluteDelta > 0) {
      impact = 'boost';
    }

    return {
      ...d,
      contributionPct,
      impact,
    };
  });

  return {
    targetMetric,
    dimension,
    baselineName,
    comparisonName,
    totalBaseline: Math.round(totalBaseline * 100) / 100,
    totalComparison: Math.round(totalComparison * 100) / 100,
    netDelta: Math.round(netDelta * 100) / 100,
    netPercentageChange: Math.round(netPercentageChange * 10) / 10,
    drivers,
  };
}
