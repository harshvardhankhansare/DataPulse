import { TableSchema, ColumnType } from '../schema/schemaTypes.js';
import { ActiveFilter } from '../analytics/filterTypes.js';
import {
  SimulationConfig,
  SimulationDriver,
  SimulationResult,
  DriverSensitivity,
  DriverContribution,
  TargetOption,
  MetricKind,
} from './scenarioTypes.js';

type QueryFunction = (sql: string) => Promise<any[]>;

const EXCLUDE_PATTERN = /(_id|^id$|id$|_key$|^key$|_code$|^code$|zip|postal|phone|ssn|row_num|record_num|isbn|uuid|guid|_year|^year$|year$|_yr$|^yr$|joiningyear|birthyear|orderyear|modelyear|hireyear|gradyear)/i;

/**
 * Automatically inspects the dataset schema, excludes non-business columns (years, IDs),
 * classifies metrics as Rates (e.g. Employee Attrition), Totals (e.g. Sales), or Averages (e.g. Scores),
 * and calculates true DuckDB regression slopes.
 */
export async function detectSimulationConfig(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction
): Promise<SimulationConfig> {
  const candidateCols: Array<{
    name: string;
    label: string;
    kind: MetricKind;
    unit: string;
    priority: number;
    distinctCount: number;
  }> = [];

  for (const col of schema.columns) {
    const lower = col.name.toLowerCase().trim();

    // Strictly skip IDs and Year columns from being prediction targets
    if (EXCLUDE_PATTERN.test(lower) || col.detectedType === ColumnType.IDENTIFIER || col.detectedType === ColumnType.DATE) {
      continue;
    }

    if (col.detectedType === ColumnType.NUMERIC || col.detectedType === ColumnType.BOOLEAN) {
      // Check if values are strictly 4-digit years (e.g. min 1900, max 2100)
      const yrCheck = await queryFn(`
        SELECT
          MIN("${col.name}") as min_v,
          MAX("${col.name}") as max_v,
          AVG("${col.name}") as avg_v
        FROM ${tableName}
        WHERE "${col.name}" IS NOT NULL
      `);
      const minV = Number(yrCheck[0]?.min_v || 0);
      const maxV = Number(yrCheck[0]?.max_v || 0);
      const avgV = Number(yrCheck[0]?.avg_v || 0);

      if (minV >= 1950 && maxV <= 2050 && avgV >= 1980) {
        // This is a calendar year! Skip it!
        continue;
      }

      // Check if this is a binary outcome (0 and 1) like LeaveOrNot, Churn, Default, Status
      const isBinary = (minV === 0 && maxV === 1 && col.distinctCount <= 2) ||
                       /leave|churn|attrition|default|converted|survive|success|fraud|status/i.test(lower);

      if (isBinary) {
        let label = col.name.replace(/_/g, ' ');
        if (/leave/i.test(lower)) label = 'Employee Attrition Rate (%)';
        else if (/churn/i.test(lower)) label = 'Customer Churn Rate (%)';
        else if (/default/i.test(lower)) label = 'Loan Default Rate (%)';
        else label = `${col.name} Rate (%)`;

        candidateCols.push({
          name: col.name,
          label,
          kind: 'rate',
          unit: '%',
          priority: 95, // High priority business outcome
          distinctCount: col.distinctCount,
        });
      } else if (/revenue|sales|profit|amount|spend|cost|salary|earnings|gmv|margin|price/i.test(lower)) {
        // High priority business financials
        candidateCols.push({
          name: col.name,
          label: col.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          kind: 'total',
          unit: '$',
          priority: 100, // Top priority
          distinctCount: col.distinctCount,
        });
      } else if (/score|rating|gpa|satisfaction|performance|nps|rank/i.test(lower)) {
        // Continuous score / rating
        candidateCols.push({
          name: col.name,
          label: `Average ${col.name.replace(/_/g, ' ')}`,
          kind: 'average',
          unit: 'pts',
          priority: 80,
          distinctCount: col.distinctCount,
        });
      } else if (col.distinctCount > 5) {
        // Generic numeric metric
        candidateCols.push({
          name: col.name,
          label: col.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          kind: 'total',
          unit: '',
          priority: 50,
          distinctCount: col.distinctCount,
        });
      }
    }
  }

  if (candidateCols.length === 0) {
    throw new Error('No predictable business metrics found in this dataset.');
  }

  // Sort candidates by priority descending
  candidateCols.sort((a, b) => b.priority - a.priority);

  const selectedTarget = candidateCols[0];
  const targetColumn = selectedTarget.name;

  const availableTargets: TargetOption[] = candidateCols.map(c => ({
    name: c.name,
    label: c.label,
    kind: c.kind,
    unit: c.unit,
    description: c.kind === 'rate'
      ? 'Calculates percentage probability of positive outcome'
      : c.kind === 'average'
      ? 'Calculates expected average value'
      : 'Calculates projected total volume and average',
  }));

  // Pick up to 5 drivers (numeric columns other than the target, excluding IDs and Years)
  const driverCandidates = schema.columns.filter(c => {
    const l = c.name.toLowerCase().trim();
    return c.name !== targetColumn &&
           !EXCLUDE_PATTERN.test(l) &&
           c.detectedType !== ColumnType.IDENTIFIER &&
           c.detectedType !== ColumnType.DATE &&
           (c.detectedType === ColumnType.NUMERIC || c.distinctCount >= 2);
  }).slice(0, 5);

  const targetEsc = `"${targetColumn.replace(/"/g, '""')}"`;
  const drivers: SimulationDriver[] = [];

  for (const col of driverCandidates) {
    const esc = `"${col.name.replace(/"/g, '""')}"`;
    try {
      const stats = await queryFn(`
        SELECT
          ROUND(COALESCE(AVG(${esc}), 0), 2) AS avg_val,
          ROUND(COALESCE(SUM(${esc}), 0), 2) AS sum_val,
          COALESCE(COVAR_SAMP(${targetEsc}, ${esc}) / NULLIF(VAR_SAMP(${esc}), 0), 0) AS slope,
          COALESCE(CORR(${targetEsc}, ${esc}), 0) AS corr
        FROM ${tableName}
        WHERE ${esc} IS NOT NULL AND ${targetEsc} IS NOT NULL
      `);
      const r = stats[0] || {};
      const avgVal = Number(r.avg_val || 0);
      const sumVal = Number(r.sum_val || 0);
      const slope = Number(r.slope || 0);
      const corr = Number(r.corr || 0);

      // Impact on target for +10% shift in this driver
      let impactPerTenPercent = 0;
      if (selectedTarget.kind === 'rate') {
        // Delta in percentage points for +10% shift in driver
        impactPerTenPercent = Number((slope * (0.10 * avgVal) * 100).toFixed(2));
      } else {
        impactPerTenPercent = Number((slope * (0.10 * sumVal)).toFixed(2));
      }

      const isPositiveImpact = corr > 0.05;
      const isNegativeImpact = corr < -0.05;

      let direction: 'positive' | 'negative' | 'neutral' = 'neutral';
      if (selectedTarget.kind === 'rate') {
        // For Attrition/Churn: negative slope means it reduces turnover (good/positive lever!)
        direction = isNegativeImpact ? 'positive' : isPositiveImpact ? 'negative' : 'neutral';
      } else {
        direction = isPositiveImpact ? 'positive' : isNegativeImpact ? 'negative' : 'neutral';
      }

      let explanation = '';
      if (selectedTarget.kind === 'rate') {
        if (corr < -0.05) {
          explanation = `Higher values reduce ${selectedTarget.label.toLowerCase()} (Retention lever)`;
        } else if (corr > 0.05) {
          explanation = `Higher values increase ${selectedTarget.label.toLowerCase()} (Risk factor)`;
        } else {
          explanation = 'Minimal direct correlation with target';
        }
      }

      drivers.push({
        name: col.name,
        label: col.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        currentAvg: avgVal,
        currentSum: sumVal,
        correlation: Number(corr.toFixed(3)),
        slope: Number(slope.toFixed(4)),
        direction,
        impactPerTenPercent,
        explanation,
      });
    } catch {
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
    targetKind: selectedTarget.kind,
    targetLabel: selectedTarget.label,
    targetUnit: selectedTarget.unit,
    availableTargets,
    drivers,
  };
}

/**
 * Runs a simulated projection using real DuckDB statistical regression.
 * Correctly distinguishes between Rate/Attrition metrics (%), Totals ($/Units), and Averages.
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

  // Detect target nature
  const targetLower = targetCol.toLowerCase();
  const sampleStats = await queryFn(`
    SELECT
      ROUND(COALESCE(SUM(${targetEsc}), 0), 2) AS total,
      ROUND(COALESCE(AVG(${targetEsc}), 0), 4) AS avg_val,
      MIN(${targetEsc}) AS min_v,
      MAX(${targetEsc}) AS max_v,
      COUNT(DISTINCT ${targetEsc}) AS distinct_v,
      COUNT(*) AS total_rows
    FROM ${tableName}
    ${filterWhere}
  `);
  const sRow = sampleStats[0] || {};
  const total = Number(sRow.total || 0);
  const avgVal = Number(sRow.avg_val || 0);
  const minV = Number(sRow.min_v || 0);
  const maxV = Number(sRow.max_v || 0);
  const distinctV = Number(sRow.distinct_v || 0);
  const totalRows = Number(sRow.total_rows || 1);

  const isBinaryRate = (minV === 0 && maxV === 1 && distinctV <= 2) ||
                       /leave|churn|attrition|default|converted|survive|status/i.test(targetLower);

  let targetKind: MetricKind = 'total';
  let targetLabel = targetCol.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  let targetUnit = '';

  if (isBinaryRate) {
    targetKind = 'rate';
    targetUnit = '%';
    if (/leave/i.test(targetLower)) targetLabel = 'Employee Attrition Rate (%)';
    else if (/churn/i.test(targetLower)) targetLabel = 'Customer Churn Rate (%)';
    else if (/default/i.test(targetLower)) targetLabel = 'Loan Default Rate (%)';
    else targetLabel = `${targetCol} Rate (%)`;
  } else if (/score|rating|gpa|satisfaction|rank/i.test(targetLower)) {
    targetKind = 'average';
    targetUnit = 'pts';
    targetLabel = `Average ${targetCol.replace(/_/g, ' ')}`;
  } else if (/revenue|sales|profit|amount|spend|cost|salary/i.test(targetLower)) {
    targetKind = 'total';
    targetUnit = '$';
    targetLabel = `Total ${targetCol.replace(/_/g, ' ')}`;
  }

  // 1. Fetch baseline numbers
  let baselineValue = 0;
  let baselineSecondaryText = '';

  if (targetKind === 'rate') {
    baselineValue = Number((avgVal * 100).toFixed(2));
    const positiveCount = Math.round(total);
    baselineSecondaryText = `${positiveCount.toLocaleString()} out of ${totalRows.toLocaleString()} employees left (Historical)`;
  } else if (targetKind === 'average') {
    baselineValue = Number(avgVal.toFixed(2));
    baselineSecondaryText = `Historical average across ${totalRows.toLocaleString()} records`;
  } else {
    baselineValue = Number(total.toFixed(2));
    baselineSecondaryText = `Average per row: ${Number(avgVal.toFixed(2)).toLocaleString()}`;
  }

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
    let avgX = 0;

    try {
      const statsRows = await queryFn(`
        SELECT
          COALESCE(COVAR_SAMP(${targetEsc}, ${driverEsc}) / NULLIF(VAR_SAMP(${driverEsc}), 0), 0) AS slope,
          COALESCE(CORR(${targetEsc}, ${driverEsc}), 0) AS corr,
          COALESCE(SUM(${driverEsc}), 0) AS sum_x,
          COALESCE(AVG(${driverEsc}), 0) AS avg_x
        FROM ${tableName}
        ${filterWhere ? `${filterWhere} AND` : 'WHERE'} ${driverEsc} IS NOT NULL AND ${targetEsc} IS NOT NULL
      `);
      const s = statsRows[0] || {};
      slope = Number(s.slope || 0);
      corr = Number(s.corr || 0);
      sumX = Number(s.sum_x || 0);
      avgX = Number(s.avg_x || 0);
    } catch {
      slope = 0;
      corr = 0;
    }

    let individualDelta = 0;
    if (targetKind === 'rate') {
      // Delta in percentage points: slope * delta_x_avg * 100
      const deltaXAvg = avgX * (percentAdj / 100);
      individualDelta = Number((slope * deltaXAvg * 100).toFixed(2));
    } else if (targetKind === 'average') {
      const deltaXAvg = avgX * (percentAdj / 100);
      individualDelta = Number((slope * deltaXAvg).toFixed(2));
    } else {
      const deltaXSum = sumX * (percentAdj / 100);
      individualDelta = Number((slope * deltaXSum).toFixed(2));
    }

    totalDelta += individualDelta;

    const label = driverName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    contributions.push({
      driverName,
      label,
      adjustmentPercent: percentAdj,
      individualDelta,
      shareOfChangePercent: 0,
      direction: individualDelta > 0 ? 'positive' : individualDelta < 0 ? 'negative' : 'neutral',
    });

    // Sensitivity (+10% standard shift)
    let impactPerTenPercent = 0;
    if (targetKind === 'rate') {
      impactPerTenPercent = Number((slope * (0.10 * avgX) * 100).toFixed(2));
    } else if (targetKind === 'average') {
      impactPerTenPercent = Number((slope * (0.10 * avgX)).toFixed(2));
    } else {
      impactPerTenPercent = Number((slope * (0.10 * sumX)).toFixed(2));
    }

    const percentageImpact = baselineValue > 0 ? Number(((impactPerTenPercent / baselineValue) * 100).toFixed(2)) : 0;

    let explanation = '';
    if (targetKind === 'rate') {
      if (impactPerTenPercent < 0) {
        explanation = `+10% shift reduces turnover by ${Math.abs(impactPerTenPercent)}%-pts (Keeps employees)`;
      } else if (impactPerTenPercent > 0) {
        explanation = `+10% shift increases turnover by +${impactPerTenPercent}%-pts`;
      } else {
        explanation = 'Shift has minimal effect on turnover';
      }
    } else {
      if (impactPerTenPercent > 0) {
        explanation = `+10% shift adds +${Math.abs(impactPerTenPercent).toLocaleString()}${targetUnit}`;
      } else if (impactPerTenPercent < 0) {
        explanation = `+10% shift reduces by -${Math.abs(impactPerTenPercent).toLocaleString()}${targetUnit}`;
      } else {
        explanation = 'Shift has minimal effect on target';
      }
    }

    sensitivities.push({
      driverName,
      label,
      correlation: Number(corr.toFixed(3)),
      slope: Number(slope.toFixed(4)),
      direction: corr > 0.05 ? 'positive' : corr < -0.05 ? 'negative' : 'neutral',
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

  // Calculate projected outcome
  let projectedValue = 0;
  let deltaValue = 0;
  let percentChange = 0;
  let projectedSecondaryText = '';
  let deltaSecondaryText = '';

  if (targetKind === 'rate') {
    projectedValue = Number(Math.min(100, Math.max(0, baselineValue + totalDelta)).toFixed(2));
    deltaValue = Number((projectedValue - baselineValue).toFixed(2));
    percentChange = baselineValue > 0 ? Number(((deltaValue / baselineValue) * 100).toFixed(1)) : 0;

    const projectedCount = Math.round((projectedValue / 100) * totalRows);
    const initialCount = Math.round((baselineValue / 100) * totalRows);
    const diffCount = projectedCount - initialCount;

    projectedSecondaryText = `${projectedCount.toLocaleString()} out of ${totalRows.toLocaleString()} employees projected to leave`;
    if (diffCount < 0) {
      deltaSecondaryText = `Retains ~${Math.abs(diffCount).toLocaleString()} more employees (-${Math.abs(percentChange)}% turnover drop)`;
    } else if (diffCount > 0) {
      deltaSecondaryText = `~${diffCount.toLocaleString()} more employees leaving (+${percentChange}% turnover increase)`;
    } else {
      deltaSecondaryText = 'No net change in employee turnover';
    }
  } else if (targetKind === 'average') {
    projectedValue = Number(Math.max(0, baselineValue + totalDelta).toFixed(2));
    deltaValue = Number((projectedValue - baselineValue).toFixed(2));
    percentChange = baselineValue > 0 ? Number(((deltaValue / baselineValue) * 100).toFixed(1)) : 0;
    projectedSecondaryText = `Projected average across ${totalRows.toLocaleString()} records`;
    deltaSecondaryText = `${deltaValue >= 0 ? '+' : ''}${deltaValue} pts (${percentChange >= 0 ? '+' : ''}${percentChange}%)`;
  } else {
    projectedValue = Number(Math.max(0, baselineValue + totalDelta).toFixed(2));
    deltaValue = Number((projectedValue - baselineValue).toFixed(2));
    percentChange = baselineValue > 0 ? Number(((deltaValue / baselineValue) * 100).toFixed(1)) : 0;
    const projAvg = Number((projectedValue / totalRows).toFixed(2));
    projectedSecondaryText = `Projected average per row: ${projAvg.toLocaleString()}`;
    deltaSecondaryText = `${deltaValue >= 0 ? '+' : ''}${deltaValue.toLocaleString()} (${percentChange >= 0 ? '+' : ''}${percentChange}%)`;
  }

  // Generate plain English narrative summary
  let summaryText = '';
  if (Math.abs(deltaValue) < 0.01) {
    summaryText = `Control levers are at baseline. Move any slider on the left to simulate operational decisions on ${targetLabel}.`;
  } else if (targetKind === 'rate') {
    const isImprovement = deltaValue < 0; // Less attrition = good
    const topActive = [...contributions].sort((a, b) => Math.abs(b.individualDelta) - Math.abs(a.individualDelta))[0];
    summaryText = `Under this scenario, ${targetLabel} moves from ${baselineValue}% to ${projectedValue}% (${deltaValue > 0 ? '+' : ''}${deltaValue}%-pts). The biggest impact comes from ${topActive?.label || 'your inputs'} (${topActive?.individualDelta > 0 ? '+' : ''}${topActive?.individualDelta}%-pts), which ${isImprovement ? 'successfully helps retain staff' : 'increases turnover risk'}.`;
  } else {
    const isGain = deltaValue > 0;
    const topActive = [...contributions].sort((a, b) => Math.abs(b.individualDelta) - Math.abs(a.individualDelta))[0];
    summaryText = `Under this scenario, projected ${targetLabel} reaches ${projectedValue.toLocaleString()}${targetUnit} (${isGain ? '+' : ''}${percentChange}% vs baseline). The primary driver of this change is ${topActive?.label || 'your inputs'} (${isGain ? '+' : ''}${topActive?.individualDelta.toLocaleString()}).`;
  }

  // Best recommendation
  let recommendationText = '';
  if (targetKind === 'rate') {
    // For Attrition, the best lever is the one with the most negative slope/impact (reduces turnover)
    const bestRetainer = [...sensitivities].sort((a, b) => a.impactPerTenPercent - b.impactPerTenPercent)[0];
    if (bestRetainer && bestRetainer.impactPerTenPercent < 0) {
      recommendationText = `Top Retention Move: Increase "${bestRetainer.label}". A +10% improvement reduces employee turnover by ${Math.abs(bestRetainer.impactPerTenPercent)}%-pts.`;
    } else {
      recommendationText = `Adjust compensation and experience levers to lower employee attrition rate.`;
    }
  } else {
    const topPositive = sensitivities.find(s => s.impactPerTenPercent > 0);
    if (topPositive) {
      recommendationText = `Top Growth Lever: Increase "${topPositive.label}". A +10% shift generates +${topPositive.impactPerTenPercent.toLocaleString()}${targetUnit}.`;
    } else {
      recommendationText = `Adjust operational levers to expand ${targetLabel}.`;
    }
  }

  return {
    targetColumn: targetCol,
    targetKind,
    targetLabel,
    targetUnit,
    baselineValue,
    baselineSecondaryText,
    projectedValue,
    projectedSecondaryText,
    deltaValue,
    percentChange,
    deltaSecondaryText,
    sensitivity: sensitivities,
    driverContributions: contributions,
    summaryText,
    recommendationText,
  };
}
