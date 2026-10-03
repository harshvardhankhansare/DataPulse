import { GroupAggregationResult } from '../analytics/groupAggregation.js';
import { DescriptiveStatsResult } from '../analytics/descriptiveStats.js';
import { CorrelationResult } from '../analytics/correlation.js';
import { TimeSeriesResult } from '../analytics/timeSeries.js';
import { ChartConfig } from './chartTypes.js';

/** Single result → single ChartConfig (for group aggregation) */
export function groupAggregationToChart(result: GroupAggregationResult): ChartConfig {
  const isCount = result.mode === 'count';
  const title = isCount
    ? `${result.categoryColumn} Distribution`
    : `Avg ${result.numericColumn} by ${result.categoryColumn}`;
  return {
    chartType: 'bar',
    availableTypes: ['bar', 'horizontal_bar', 'pie', 'donut', 'funnel', 'radar'],
    title,
    xAxisLabel: result.categoryColumn,
    yAxisLabel: isCount ? 'Count' : `Avg ${result.numericColumn}`,
    data: result.rows.map(r => ({
      label: r.category,
      value: r.avg_value,
      value2: r.sum_value,
    })),
    analysisType: 'group_aggregation',
    sourceColumns: [result.categoryColumn, result.numericColumn],
  };
}

/** Array of results → array of ChartConfigs */
export function groupAggregationToCharts(results: GroupAggregationResult[]): ChartConfig[] {
  return results.map(groupAggregationToChart);
}

export function descriptiveStatsToChart(result: DescriptiveStatsResult): ChartConfig {
  return {
    chartType: 'histogram',
    availableTypes: ['histogram', 'bar', 'area', 'line'],
    title: `Distribution of ${result.stats.column}`,
    xAxisLabel: `${result.stats.column} (Range)`,
    yAxisLabel: 'Frequency (Count)',
    data: result.histogram.map(h => ({
      label: h.binRange,
      value: h.count,
    })),
    statsSummary: {
      mean: result.stats.mean,
      median: result.stats.median,
      stddev: result.stats.stddev,
      min: result.stats.min,
      max: result.stats.max,
      nullCount: result.stats.nullCount,
      totalCount: result.stats.count,
    },
    analysisType: 'descriptive_stats',
    sourceColumns: [result.stats.column],
  };
}

/** Single correlation result → ChartConfig */
export function correlationToChart(result: CorrelationResult): ChartConfig {
  const strength = Math.abs(result.correlation);
  const dir = result.correlation >= 0 ? 'positive' : 'negative';
  const label = strength >= 0.7 ? `Strong ${dir}` : strength >= 0.4 ? `Moderate ${dir}` : `Weak ${dir}`;
  return {
    chartType: 'scatter',
    availableTypes: ['scatter'],
    title: `${result.column1} vs ${result.column2} — r = ${result.correlation.toFixed(2)} (${label})`,
    xAxisLabel: result.column1,
    yAxisLabel: result.column2,
    scatterData: result.points.map(p => ({ x: p.x, y: p.y })),
    correlation: result.correlation,
    analysisType: 'correlation',
    sourceColumns: [result.column1, result.column2],
  };
}

/** Array of correlation results → array of ChartConfigs */
export function correlationToCharts(results: CorrelationResult[]): ChartConfig[] {
  return results.map(correlationToChart);
}

/** Single time series result → ChartConfig */
export function timeSeriesToChart(result: TimeSeriesResult): ChartConfig {
  const isCount = result.mode === 'count';
  return {
    chartType: 'area',
    availableTypes: ['area', 'line', 'bar'],
    title: isCount
      ? `Employee Count by ${result.dateColumn}`
      : `Avg ${result.numericColumn} over ${result.dateColumn}`,
    xAxisLabel: result.dateColumn,
    yAxisLabel: isCount ? 'Count' : `Avg ${result.numericColumn}`,
    data: result.points.map(p => ({
      label: p.period,
      value: p.value,
    })),
    analysisType: 'time_series',
    sourceColumns: [result.dateColumn, result.numericColumn],
  };
}

/** Array of time series results → array of ChartConfigs */
export function timeSeriesToCharts(results: TimeSeriesResult[]): ChartConfig[] {
  return results.map(timeSeriesToChart);
}
