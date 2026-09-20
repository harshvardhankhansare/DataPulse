import { TableSchema, ColumnType } from '../schema/schemaTypes.js';
import {
  DiagnosticReport,
  DiagnosticTargetOption,
  InvestigationStep,
  ExecutiveSummary,
} from './diagnosticTypes.js';
import { computeVarianceDecomposition } from './varianceEngine.js';
import { ChartConfig } from '../charts/chartTypes.js';

type QueryFunction = (sql: string) => Promise<any[]>;

/**
 * Returns available target metrics, dimensions, and suggested investigative questions for the dataset.
 */
export function getDiagnosticTargets(schema: TableSchema): DiagnosticTargetOption[] {
  const numerics = schema.columns.filter(
    c =>
      c.detectedType === ColumnType.NUMERIC &&
      !c.name.toLowerCase().endsWith('_id') &&
      c.name.toLowerCase() !== 'id'
  );

  const categoricals = schema.columns.filter(
    c => c.detectedType === ColumnType.CATEGORICAL || c.detectedType === ColumnType.TEXT
  );

  const targetPriority = /profit|revenue|sales|margin|cost|amount|price|salary|loss|spend/i;
  const sortedNumerics = [...numerics].sort((a, b) => {
    const aPri = targetPriority.test(a.name) ? 1 : 0;
    const bPri = targetPriority.test(b.name) ? 1 : 0;
    return bPri - aPri;
  });

  const dimNames = categoricals.map(c => c.name).slice(0, 6);

  return sortedNumerics.map(num => {
    const questions: string[] = [];
    if (dimNames.length > 0) {
      questions.push(`What drove the variance in ${num.name} across ${dimNames[0]}?`);
      if (dimNames.length > 1) {
        questions.push(`Why did ${num.name} shift across ${dimNames[1]}?`);
      }
      questions.push(`Isolate the primary root causes behind ${num.name} performance.`);
    } else {
      questions.push(`Analyze variance and drift in ${num.name}.`);
    }

    return {
      metric: num.name,
      dimensions: dimNames,
      suggestedQuestions: questions,
    };
  });
}

/**
 * Autonomous Multi-Step Diagnostic Agent
 */
export async function runDiagnosticInvestigation(
  tableName: string,
  schema: TableSchema,
  queryFn: QueryFunction,
  targetMetric?: string,
  dimension?: string,
  userQuestion?: string
): Promise<DiagnosticReport> {
  const targets = getDiagnosticTargets(schema);
  if (targets.length === 0) {
    throw new Error('No numeric metrics found in dataset for diagnostic investigation.');
  }

  // 1. Resolve Target Metric & Dimension
  let selectedMetric = targetMetric;
  let selectedDimension = dimension;

  if (userQuestion) {
    const qLower = userQuestion.toLowerCase();
    for (const t of targets) {
      if (qLower.includes(t.metric.toLowerCase())) {
        selectedMetric = t.metric;
        break;
      }
    }
    for (const d of targets[0].dimensions) {
      if (qLower.includes(d.toLowerCase())) {
        selectedDimension = d;
        break;
      }
    }
  }

  if (!selectedMetric) {
    selectedMetric = targets[0].metric;
  }
  const metricConfig = targets.find(t => t.metric === selectedMetric) || targets[0];
  if (!selectedDimension || !metricConfig.dimensions.includes(selectedDimension)) {
    selectedDimension = metricConfig.dimensions[0] || 'Category';
  }

  const steps: InvestigationStep[] = [];
  const escTable = `"${tableName.replace(/"/g, '""')}"`;
  const escTarget = `"${selectedMetric.replace(/"/g, '""')}"`;
  const escDim = `"${selectedDimension.replace(/"/g, '""')}"`;

  // -------------------------------------------------------------
  // Step 1: Macro Metric Baseline Scan
  // -------------------------------------------------------------
  const t0 = performance.now();
  const macroSql = `
    SELECT 
      COUNT(*) AS total_rows,
      SUM(${escTarget}) AS total_sum,
      AVG(${escTarget}) AS avg_val,
      MIN(${escTarget}) AS min_val,
      MAX(${escTarget}) AS max_val
    FROM ${escTable}
    WHERE ${escTarget} IS NOT NULL;
  `;
  const macroRows = await queryFn(macroSql);
  const macroDur = Math.round(performance.now() - t0);
  const totalRows = Number(macroRows[0]?.total_rows || 0);
  const macroSum = Math.round(Number(macroRows[0]?.total_sum || 0) * 100) / 100;
  const macroAvg = Math.round(Number(macroRows[0]?.avg_val || 0) * 100) / 100;

  steps.push({
    stepNumber: 1,
    title: `Macro Scan: ${selectedMetric} Distribution`,
    sql: macroSql.trim(),
    executionMs: macroDur,
    rowCount: 1,
    discovery: `Dataset has ${totalRows.toLocaleString()} observations. Macro total: ${macroSum.toLocaleString()}, Average: ${macroAvg.toLocaleString()}.`,
  });

  // -------------------------------------------------------------
  // Step 2: Primary Dimensional Variance Decomposition
  // -------------------------------------------------------------
  const t1 = performance.now();
  const decomp = await computeVarianceDecomposition(
    tableName,
    schema,
    selectedMetric,
    selectedDimension,
    queryFn
  );
  const decompDur = Math.round(performance.now() - t1);

  const topDriver = decomp.drivers[0] || {
    name: 'Unknown',
    baselineValue: 0,
    comparisonValue: 0,
    absoluteDelta: 0,
    percentageChange: 0,
    contributionPct: 0,
    impact: 'neutral' as const,
  };

  steps.push({
    stepNumber: 2,
    title: `Variance Decomposition across ${selectedDimension}`,
    sql: `-- Evaluated windowed cohort shift (H1 vs H2) grouped by ${selectedDimension}\nSELECT ${escDim}, SUM(...) FROM ... GROUP BY ${escDim}`,
    executionMs: decompDur,
    rowCount: decomp.drivers.length,
    discovery: `Identified ${decomp.drivers.length} distinct segments. Top variance driver "${topDriver.name}" accounts for ${topDriver.contributionPct}% of total absolute variance (${topDriver.absoluteDelta >= 0 ? '+' : ''}${topDriver.absoluteDelta.toLocaleString()}).`,
  });

  // -------------------------------------------------------------
  // Step 3: Secondary Factor Isolation (Drill-Down on Top Driver)
  // -------------------------------------------------------------
  const secondaryDims = metricConfig.dimensions.filter(d => d !== selectedDimension);
  let secondaryDiscovery = `No secondary categorical dimensions available for drill-down.`;
  let secSql = `-- Top driver isolation complete.`;
  let secDur = 1;
  let secRowCount = 0;

  if (secondaryDims.length > 0) {
    const secDim = secondaryDims[0];
    const escSecDim = `"${secDim.replace(/"/g, '""')}"`;
    const t2 = performance.now();
    secSql = `
      SELECT 
        ${escSecDim} AS sub_segment,
        COUNT(*) AS obs_count,
        SUM(${escTarget}) AS sub_total
      FROM ${escTable}
      WHERE ${escDim} = '${topDriver.name.replace(/'/g, "''")}'
      GROUP BY ${escSecDim}
      ORDER BY sub_total DESC
      LIMIT 5;
    `;
    const secRows = await queryFn(secSql);
    secDur = Math.round(performance.now() - t2);
    secRowCount = secRows.length;
    if (secRows.length > 0) {
      const topSub = secRows[0];
      secondaryDiscovery = `Within "${topDriver.name}", sub-dimension "${secDim}" concentrated heavily in "${topSub.sub_segment}" with ${Math.round(Number(topSub.sub_total)).toLocaleString()} total volume.`;
    }
  }

  steps.push({
    stepNumber: 3,
    title: `Secondary Factor Drill-Down: ${topDriver.name}`,
    sql: secSql.trim(),
    executionMs: secDur,
    rowCount: secRowCount,
    discovery: secondaryDiscovery,
  });

  // -------------------------------------------------------------
  // Step 4: Construct Waterfall Bridge Chart Config
  // -------------------------------------------------------------
  // Waterfall data points:
  // 1: Baseline Total
  // 2..N: Individual segment deltas
  // N+1: Final Comparison Total
  const waterfallData = [
    { label: decomp.baselineName, value: decomp.totalBaseline },
    ...decomp.drivers.slice(0, 6).map(d => ({
      label: d.name,
      value: d.absoluteDelta,
    })),
    { label: decomp.comparisonName, value: decomp.totalComparison },
  ];

  const waterfallChart: ChartConfig = {
    chartType: 'waterfall',
    analysisType: 'variance_decomposition' as any,
    sourceColumns: [selectedDimension, selectedMetric],
    title: `${selectedMetric} Variance Bridge (${decomp.baselineName} → ${decomp.comparisonName})`,
    xAxisLabel: selectedDimension,
    yAxisLabel: selectedMetric,
    data: waterfallData,
  };

  // -------------------------------------------------------------
  // Step 5: Synthesize Executive Summary & Root-Cause Narrative
  // -------------------------------------------------------------
  const drags = decomp.drivers.filter(d => d.impact === 'drag');
  const boosts = decomp.drivers.filter(d => d.impact === 'boost');

  const headline =
    decomp.netDelta < 0
      ? `Net ${Math.abs(decomp.netPercentageChange).toFixed(1)}% Decline in ${selectedMetric} primarily driven by ${topDriver.name}`
      : `Net +${decomp.netPercentageChange.toFixed(1)}% Growth in ${selectedMetric} led by ${topDriver.name}`;

  const primaryRootCause =
    topDriver.impact === 'drag'
      ? `The largest negative drag is "${topDriver.name}", contributing ${topDriver.contributionPct}% of total variance with a ${topDriver.absoluteDelta.toLocaleString()} deficit (${topDriver.percentageChange}% drop vs baseline).`
      : `The primary growth driver is "${topDriver.name}", contributing ${topDriver.contributionPct}% of total variance with a +${topDriver.absoluteDelta.toLocaleString()} expansion (+${topDriver.percentageChange}% vs baseline).`;

  const mitigatingFactors =
    boosts.length > 0 && drags.length > 0
      ? `Performance drag was partially counterbalanced by positive gains in ${boosts.slice(0, 2).map(b => `"${b.name}" (+${b.absoluteDelta.toLocaleString()})`).join(' and ')}.`
      : drags.length > 0
      ? `All top monitored segments experienced contraction, leaving no major offsetting segments.`
      : `Broad-based expansion observed across multiple categories with negligible drags.`;

  const recommendations: string[] = [];
  if (topDriver.impact === 'drag') {
    recommendations.push(
      `Conduct immediate operational audit on "${topDriver.name}" to arrest the ${Math.abs(topDriver.percentageChange)}% contraction.`
    );
    if (boosts.length > 0) {
      recommendations.push(
        `Reallocate budget/resources from lagging segments toward outperforming category "${boosts[0].name}".`
      );
    } else {
      recommendations.push(
        `Implement price elasticity or volume incentive levers identified in the Simulation module.`
      );
    }
    recommendations.push(
      `Cross-filter analytics dashboard on "${topDriver.name}" to isolate geographic or SKU-level anomalies.`
    );
  } else {
    recommendations.push(
      `Double down on momentum in "${topDriver.name}" which delivered ${topDriver.contributionPct}% of total gains.`
    );
    if (drags.length > 0) {
      recommendations.push(
        `Investigate drag in "${drags[0].name}" (${drags[0].absoluteDelta.toLocaleString()}) to prevent further margin erosion.`
      );
    }
    recommendations.push(
      `Run scenario simulation modeling a further +15% expansion in top growth drivers.`
    );
  }

  const executiveSummary: ExecutiveSummary = {
    headline,
    primaryRootCause,
    mitigatingFactors,
    actionableRecommendations: recommendations,
  };

  return {
    targetMetric: selectedMetric,
    dimension: selectedDimension,
    totalBaseline: decomp.totalBaseline,
    totalComparison: decomp.totalComparison,
    netDelta: decomp.netDelta,
    netPercentageChange: decomp.netPercentageChange,
    primaryDriver: topDriver,
    drivers: decomp.drivers,
    steps,
    waterfallChart,
    executiveSummary,
    generatedAt: new Date().toISOString(),
  };
}
