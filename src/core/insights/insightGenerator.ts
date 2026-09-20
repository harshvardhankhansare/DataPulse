import { Insight, ConfidenceLevel } from './insightTypes.js';
import { GroupAggregationResult } from '../analytics/groupAggregation.js';
import { DescriptiveStatsResult } from '../analytics/descriptiveStats.js';
import { CorrelationResult } from '../analytics/correlation.js';
import { TimeSeriesResult } from '../analytics/timeSeries.js';
import { TableSchema } from '../schema/schemaTypes.js';

function formatValue(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(2))}`;
}

function calculateConfidence(totalRows: number, nullCount: number): ConfidenceLevel {
  const nullRatio = totalRows > 0 ? nullCount / totalRows : 0;
  if (totalRows >= 50 && nullRatio < 0.05) return 'high';
  if (totalRows >= 8 && nullRatio < 0.20) return 'medium';
  return 'low';
}

/**
 * Generates insights from Group Aggregation results.
 */
export function generateGroupAggregationInsights(
  tableName: string,
  result: GroupAggregationResult,
  schema: TableSchema
): Insight[] {
  const insights: Insight[] = [];
  const rows = result.rows;
  if (rows.length === 0) return insights;

  const totalRows = schema.columns[0]?.totalRows || 0;
  const numColMeta = schema.columns.find(c => c.name === result.numericColumn);
  const nullCount = numColMeta?.nullCount || 0;
  const confidence = calculateConfidence(totalRows, nullCount);

  // 1. Comparison: Top vs Second
  const top = rows[0];
  if (rows.length >= 2) {
    const second = rows[1];
    const diff = top.avg_value - second.avg_value;
    const pctMore = second.avg_value !== 0 ? (diff / Math.abs(second.avg_value)) * 100 : 0;

    insights.push({
      id: `agg_comp_${result.categoryColumn}_${result.numericColumn}`,
      text: `"${top.category}" leads with the highest average ${result.numericColumn} (${formatValue(top.avg_value)}), which is ${Math.abs(pctMore).toFixed(1)}% ${pctMore >= 0 ? 'higher' : 'lower'} than "${second.category}" (${formatValue(second.avg_value)}).`,
      evidenceQuery: `SELECT "${result.categoryColumn}", ROUND(AVG("${result.numericColumn}"), 4) AS avg_value FROM ${tableName} WHERE "${result.categoryColumn}" IS NOT NULL AND "${result.numericColumn}" IS NOT NULL GROUP BY 1 ORDER BY avg_value DESC LIMIT 2;`,
      sourceColumns: [result.categoryColumn, result.numericColumn],
      insightType: 'comparison',
      confidence,
      metadata: {
        analysisType: 'group_aggregation',
        values: { topCategory: top.category, topValue: top.avg_value, secondCategory: second.category, secondValue: second.avg_value }
      }
    });
  }

  // 2. Summary / Concentration: Top contributor
  const totalSum = rows.reduce((acc, r) => acc + r.sum_value, 0);
  if (totalSum > 0) {
    const topConcentration = (top.sum_value / totalSum) * 100;
    if (topConcentration >= 25) {
      insights.push({
        id: `agg_conc_${result.categoryColumn}_${result.numericColumn}`,
        text: `"${top.category}" contributes ${topConcentration.toFixed(1)}% of the total ${result.numericColumn} volume across evaluated categories.`,
        evidenceQuery: `SELECT "${result.categoryColumn}", ROUND(SUM("${result.numericColumn}"), 4) AS total_val, ROUND(SUM("${result.numericColumn}") * 100.0 / SUM(SUM("${result.numericColumn}")) OVER (), 2) AS pct_of_total FROM ${tableName} WHERE "${result.categoryColumn}" IS NOT NULL AND "${result.numericColumn}" IS NOT NULL GROUP BY 1 ORDER BY total_val DESC;`,
        sourceColumns: [result.categoryColumn, result.numericColumn],
        insightType: 'summary',
        confidence,
        metadata: {
          analysisType: 'group_aggregation',
          values: { topCategory: top.category, concentrationPct: topConcentration }
        }
      });
    }
  }

  return insights;
}

/**
 * Generates insights from Descriptive Statistics results.
 */
export function generateDescriptiveStatsInsights(
  tableName: string,
  result: DescriptiveStatsResult,
  schema: TableSchema
): Insight[] {
  const insights: Insight[] = [];
  const s = result.stats;
  const totalRows = schema.columns[0]?.totalRows || s.count;
  const confidence = calculateConfidence(totalRows, s.nullCount);

  // 1. Variability & Spread
  const cv = s.mean !== 0 ? (s.stddev / Math.abs(s.mean)) * 100 : 0;
  const variability = cv > 60 ? 'high' : cv > 20 ? 'moderate' : 'low';

  insights.push({
    id: `desc_var_${s.column}`,
    text: `"${s.column}" exhibits ${variability} dispersion (CV = ${Math.abs(cv).toFixed(1)}%, std dev = ${formatValue(s.stddev)}) with a mean of ${formatValue(s.mean)} spanning from ${formatValue(s.min)} to ${formatValue(s.max)}.`,
    evidenceQuery: `SELECT ROUND(AVG("${s.column}"), 4) AS mean, ROUND(STDDEV_SAMP("${s.column}"), 4) AS stddev, ROUND(MIN("${s.column}"), 4) AS min_val, ROUND(MAX("${s.column}"), 4) AS max_val FROM ${tableName};`,
    sourceColumns: [s.column],
    insightType: 'summary',
    confidence,
    metadata: {
      analysisType: 'descriptive_stats',
      values: { mean: s.mean, stddev: s.stddev, cv, min: s.min, max: s.max }
    }
  });

  // 2. Skewness / Asymmetry
  if (s.stddev > 0 && Math.abs(s.mean - s.median) / s.stddev >= 0.15) {
    const isPositive = s.mean > s.median;
    const skewDesc = isPositive
      ? 'right-skewed (elevated by higher outlier values)'
      : 'left-skewed (weighted towards lower values)';

    insights.push({
      id: `desc_skew_${s.column}`,
      text: `The distribution of "${s.column}" is ${skewDesc}, with the median (${formatValue(s.median)}) ${isPositive ? 'below' : 'above'} the mean (${formatValue(s.mean)}).`,
      evidenceQuery: `SELECT ROUND(AVG("${s.column}"), 4) AS mean, ROUND(MEDIAN("${s.column}"), 4) AS median FROM ${tableName};`,
      sourceColumns: [s.column],
      insightType: 'summary',
      confidence,
      metadata: {
        analysisType: 'descriptive_stats',
        values: { mean: s.mean, median: s.median }
      }
    });
  }

  return insights;
}

/**
 * Generates insights from Correlation results.
 */
export function generateCorrelationInsights(
  tableName: string,
  result: CorrelationResult,
  schema: TableSchema
): Insight[] {
  const insights: Insight[] = [];
  const totalRows = schema.columns[0]?.totalRows || result.points.length;
  const col1Meta = schema.columns.find(c => c.name === result.column1);
  const col2Meta = schema.columns.find(c => c.name === result.column2);
  const nullCount = Math.max(col1Meta?.nullCount || 0, col2Meta?.nullCount || 0);
  const confidence = calculateConfidence(totalRows, nullCount);

  const r = result.correlation;
  const absR = Math.abs(r);

  const strength = absR >= 0.7 ? 'strong' : absR >= 0.35 ? 'moderate' : absR >= 0.15 ? 'weak' : 'negligible';
  const direction = r > 0 ? 'positive' : 'negative';
  const explanation = r > 0
    ? 'increases in one variable correlate with increases in the other'
    : 'increases in one variable correlate with decreases in the other';

  insights.push({
    id: `corr_${result.column1}_${result.column2}`,
    text: `"${result.column1}" and "${result.column2}" demonstrate a ${strength} ${direction} correlation (r = ${r.toFixed(4)}), indicating that ${explanation}.`,
    evidenceQuery: `SELECT ROUND(CORR("${result.column1}", "${result.column2}"), 4) AS pearson_r FROM ${tableName} WHERE "${result.column1}" IS NOT NULL AND "${result.column2}" IS NOT NULL;`,
    sourceColumns: [result.column1, result.column2],
    insightType: 'correlation',
    confidence,
    metadata: {
      analysisType: 'correlation',
      values: { correlation: r, strength, direction }
    }
  });

  return insights;
}

/**
 * Generates insights from Time Series results.
 */
export function generateTimeSeriesInsights(
  tableName: string,
  result: TimeSeriesResult,
  schema: TableSchema
): Insight[] {
  const insights: Insight[] = [];
  const points = result.points;
  if (points.length < 2) return insights;

  const totalRows = schema.columns[0]?.totalRows || points.length;
  const numColMeta = schema.columns.find(c => c.name === result.numericColumn);
  const confidence = calculateConfidence(totalRows, numColMeta?.nullCount || 0);

  const first = points[0];
  const last = points[points.length - 1];
  const diff = last.value - first.value;
  const changePct = first.value !== 0 ? (diff / Math.abs(first.value)) * 100 : 0;
  const direction = changePct > 0 ? 'increased' : changePct < 0 ? 'decreased' : 'remained steady';

  insights.push({
    id: `ts_${result.dateColumn}_${result.numericColumn}`,
    text: `"${result.numericColumn}" ${direction} by ${Math.abs(changePct).toFixed(1)}% across time (${first.period} to ${last.period}), shifting from an average of ${formatValue(first.value)} to ${formatValue(last.value)}.`,
    evidenceQuery: `SELECT CAST(strftime(TRY_CAST("${result.dateColumn}" AS TIMESTAMP), '%Y-%m-%d') AS VARCHAR) AS period, ROUND(AVG("${result.numericColumn}"), 4) AS avg_value FROM ${tableName} WHERE "${result.dateColumn}" IS NOT NULL AND "${result.numericColumn}" IS NOT NULL GROUP BY 1 ORDER BY period ASC;`,
    sourceColumns: [result.dateColumn, result.numericColumn],
    insightType: 'trend',
    confidence,
    metadata: {
      analysisType: 'time_series',
      values: { startPeriod: first.period, endPeriod: last.period, startValue: first.value, endValue: last.value, changePct }
    }
  });

  return insights;
}
