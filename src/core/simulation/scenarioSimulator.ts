import { TableSchema, ColumnType } from '../schema/schemaTypes.js';
import { ActiveFilter } from '../analytics/filterTypes.js';
import {
  SimulationConfig,
  SimulationDriver,
  SimulationResult,
  DriverSensitivity,
  DriverContribution,
} from './scenarioTypes.js';

type QueryFunction = (sql: string) => Promise<any[]>;

/**
 * Automatically detects the outcome target column and candidate simulation drivers,
 * calculating real regression slopes and Pearson correlations with DuckDB.
 */
export async function detectSimulationConfig(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction
): Promise<SimulationConfig> {
  const numerics = schema.columns.filter(
    c => c.detectedType === ColumnType.NUMERIC &&
         !c.name.toLowerCase().endsWith('_id') &&
         c.name.toLowerCase() !== 'id'
  );

  if (numerics.length === 0) {
    throw new Error('Simulation requires at least one numeric column');
  }

  // Priority detection for business outcome targets
  const targetPattern = /revenue|sales|profit|amount|total|price|cost|score|salary|value|spend|gpa|balance/i;
  const targetCandidate = numerics.find(c => targetPattern.test(c.name)) || numerics[0];
  const targetColumn = targetCandidate.name;

  const availableTargets = numerics.map(c => c.name);

  // Pick up to 5 drivers (prioritizing non-target numeric metrics)
  const driverCandidates = numerics.filter(c => c.name !== targetColumn).slice(0, 5);
  if (driverCandidates.length === 0) {
    driverCandidates.push(targetCandidate);
  }

  const targetEsc = `"${targetColumn.replace(/"/g, '""')}"`;
  const drivers: SimulationDriver[] = [];

  for (const col of driverCandidates) {
    const esc = `"${col.name.replace(/"/g, '""')}"`;
    try {
      const rows = await queryFn(`
        SELECT
          ROUND(COALESCE(AVG(${esc}), 0), 2) AS avg_val,
          ROUND(COALESCE(SUM(${esc}), 0), 2) AS sum_val,
          COALESCE(COVAR_SAMP(${targetEsc}, ${esc}) / NULLIF(VAR_SAMP(${esc}), 0), 0) AS slope,
          COALESCE(CORR(${targetEsc}, ${esc}), 0) AS corr
        FROM ${tableName}
        WHERE ${esc} IS NOT NULL AND ${targetEsc} IS NOT NULL
      `);
      const r = rows[0] || {};
      const avgVal = Number(r.avg_val || 0);
      const sumVal = Number(r.sum_val || 0);
      const slope = Number(r.slope || 0);
      const corr = Number(r.corr || 0);

      // Impact of +10% shift in this driver
      let impactPerTenPercent = Number((slope * (0.10 * sumVal)).toFixed(2));
      // Fallback if slope is 0 or no variance
      if (impactPerTenPercent === 0 && avgVal > 0) {
        impactPerTenPercent = Number((avgVal * 0.10).toFixed(2));
      }

      const direction: 'positive' | 'negative' | 'neutral' =
        corr > 0.08 ? 'positive' : corr < -0.08 ? 'negative' : 'neutral';

      drivers.push({
        name: col.name,
        label: col.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        currentAvg: avgVal,
        currentSum: sumVal,
        correlation: Number(corr.toFixed(3)),
        slope: Number(slope.toFixed(4)),
        direction,
        impactPerTenPercent,
      });
    } catch {
      // Fallback if statistical calculation fails
      drivers.push({
        name: col.name,
        label: col.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        currentAvg: 0,
        currentSum: 0,
        correlation: 0,
        slope: 0,
        direction: 'neutral',
        impactPerTenPercent: 0,
      });
    }
  }

  return {
    targetColumn,
    availableTargets,
    drivers,
  };
}

/**
 * Runs a simulated projection comparing baseline vs. adjusted outcomes.
 * Uses true regression slopes so increases in cost/discount reduce profit,
 * and increases in volume/price increase revenue.
 */
export async function runSimulation(
  tableName: string,
  _schema: TableSchema,
  queryFn: QueryFunction,
  targetCol: string,
  adjustments: Record<string, number>,
  filter?: ActiveFilter
): Promise<SimulationResult> {
  const targetEsc = `"${targetCol.replace(/"/g, '""')}"`;
  const filterWhere = filter
    ? `WHERE "${filter.column.replace(/"/g, '""')}" = '${String(filter.value).replace(/'/g, "''")}'`
    : '';

  // 1. Fetch baseline
  const baselineRows = await queryFn(`
    SELECT
      ROUND(COALESCE(SUM(${targetEsc}), 0), 2) AS total,
      ROUND(COALESCE(AVG(${targetEsc}), 0), 2) AS avg,
      COUNT(*) AS total_rows
    FROM ${tableName}
    ${filterWhere}
  `);
  const bRow = baselineRows[0] || {};
  const baselineTotal = Number(bRow.total || 0);
  const baselineAvg = Number(bRow.avg || 0);
  const totalRows = Number(bRow.total_rows || 1);

  // 2. Fetch slopes and correlations for each driver
  const driverKeys = Object.keys(adjustments);
  let totalDelta = 0;
  const contributions: DriverContribution[] = [];
  const sensitivities: DriverSensitivity[] = [];

  for (const driverName of driverKeys) {
    const percentAdj = adjustments[driverName] || 0;
    const driverEsc = `"${driverName.replace(/"/g, '""')}"`;

    let slope = 0;
    let corr = 0;
    let sumX = 0;

    try {
      const statsRows = await queryFn(`
        SELECT
          COALESCE(COVAR_SAMP(${targetEsc}, ${driverEsc}) / NULLIF(VAR_SAMP(${driverEsc}), 0), 0) AS slope,
          COALESCE(CORR(${targetEsc}, ${driverEsc}), 0) AS corr,
          COALESCE(SUM(${driverEsc}), 0) AS sum_x
        FROM ${tableName}
        ${filterWhere ? `${filterWhere} AND` : 'WHERE'} ${driverEsc} IS NOT NULL AND ${targetEsc} IS NOT NULL
      `);
      const sRow = statsRows[0] || {};
      slope = Number(sRow.slope || 0);
      corr = Number(sRow.corr || 0);
      sumX = Number(sRow.sum_x || 0);
    } catch {
      slope = 0;
      corr = 0;
    }

    // Direction
    const direction: 'positive' | 'negative' | 'neutral' =
      corr > 0.08 ? 'positive' : corr < -0.08 ? 'negative' : 'neutral';

    // Calculate individual delta based on slope:
    // delta_target = slope * delta_driver_total
    // delta_driver_total = sumX * (percentAdj / 100)
    let individualDelta = 0;
    if (sumX > 0 && Math.abs(slope) > 0.0001) {
      individualDelta = Number((slope * sumX * (percentAdj / 100)).toFixed(2));
    } else {
      // Proportional fallback if no variance or slope is 0
      individualDelta = Number((baselineTotal * (percentAdj / 100) * (1 / Math.max(1, driverKeys.length))).toFixed(2));
    }

    totalDelta += individualDelta;

    const label = driverName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    contributions.push({
      driverName,
      label,
      adjustmentPercent: percentAdj,
      individualDelta,
      shareOfChangePercent: 0, // will compute after total
      direction: individualDelta > 0 ? 'positive' : individualDelta < 0 ? 'negative' : 'neutral',
    });

    // Sensitivity (+10% standard shift)
    const impactPerTenPercent = Number((slope !== 0 ? slope * sumX * 0.10 : baselineTotal * 0.10 * (1 / Math.max(1, driverKeys.length))).toFixed(2));
    const percentageImpact = baselineTotal > 0 ? Number(((impactPerTenPercent / baselineTotal) * 100).toFixed(2)) : 0;

    let explanation = '';
    if (impactPerTenPercent > 0) {
      explanation = `Every +10% shift adds +${Math.abs(impactPerTenPercent).toLocaleString()} to ${targetCol} (Positive correlation: +${corr.toFixed(2)})`;
    } else if (impactPerTenPercent < 0) {
      explanation = `Every +10% shift reduces ${targetCol} by -${Math.abs(impactPerTenPercent).toLocaleString()} (Negative correlation: ${corr.toFixed(2)})`;
    } else {
      explanation = `Shift has minimal impact on ${targetCol} (Weak correlation: ${corr.toFixed(2)})`;
    }

    sensitivities.push({
      driverName,
      label,
      correlation: Number(corr.toFixed(3)),
      slope: Number(slope.toFixed(4)),
      direction,
      impactPerTenPercent,
      percentageImpact,
      elasticityRank: 1,
      plainExplanation: explanation,
    });
  }

  // Calculate share of change percentages
  const sumAbsDeltas = contributions.reduce((acc, c) => acc + Math.abs(c.individualDelta), 0);
  contributions.forEach(c => {
    c.shareOfChangePercent = sumAbsDeltas > 0 ? Math.round((Math.abs(c.individualDelta) / sumAbsDeltas) * 100) : 0;
  });

  // Sort sensitivities by absolute impact descending
  sensitivities.sort((a, b) => Math.abs(b.impactPerTenPercent) - Math.abs(a.impactPerTenPercent));
  sensitivities.forEach((s, idx) => {
    s.elasticityRank = idx + 1;
  });

  const projectedTotal = Number(Math.max(0, baselineTotal + totalDelta).toFixed(2));
  const deltaTotal = Number((projectedTotal - baselineTotal).toFixed(2));
  const projectedAvg = Number(Math.max(0, baselineAvg + (deltaTotal / totalRows)).toFixed(2));
  const percentChange = baselineTotal > 0 ? Number(((deltaTotal / baselineTotal) * 100).toFixed(2)) : 0;

  // Generate plain English narrative summary
  let summaryText = '';
  if (Math.abs(deltaTotal) < 0.01) {
    summaryText = `Sliders are at baseline. Adjust any control lever on the left to simulate changes in ${targetCol}.`;
  } else {
    const isGain = deltaTotal > 0;
    const topActive = [...contributions].sort((a, b) => Math.abs(b.individualDelta) - Math.abs(a.individualDelta))[0];
    summaryText = `Under this scenario, projected ${targetCol} will reach ${projectedTotal.toLocaleString()} (${isGain ? '+' : ''}${percentChange}% vs baseline). The primary driver of this change is ${topActive?.label || 'your inputs'} (${isGain ? '+' : ''}${topActive?.individualDelta.toLocaleString()}).`;
  }

  // Best recommendation
  const topPositive = sensitivities.find(s => s.impactPerTenPercent > 0);
  let recommendationText = '';
  if (topPositive) {
    recommendationText = `Highest Growth Lever: Focus on "${topPositive.label}". A +10% increase generates +${topPositive.impactPerTenPercent.toLocaleString()} in ${targetCol}.`;
  } else {
    recommendationText = `Adjust positive growth drivers to expand overall ${targetCol}.`;
  }

  return {
    targetColumn: targetCol,
    baselineTotal,
    baselineAvg,
    projectedTotal,
    projectedAvg,
    deltaTotal,
    percentChange,
    sensitivity: sensitivities,
    driverContributions: contributions,
    summaryText,
    recommendationText,
  };
}
