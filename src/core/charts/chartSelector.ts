import { GroupAggregationResult } from '../analytics/groupAggregation.js';
import { DescriptiveStatsResult } from '../analytics/descriptiveStats.js';
import { CorrelationResult } from '../analytics/correlation.js';
import { TimeSeriesResult } from '../analytics/timeSeries.js';
import { ChartConfig } from './chartTypes.js';

export function groupAggregationToChart(result: GroupAggregationResult): ChartConfig {
  return {
    chartType: 'bar',
    availableTypes: ['bar', 'horizontal_bar', 'pie', 'donut', 'funnel', 'radar'],
    title: `${result.numericColumn} by ${result.categoryColumn}`,
    xAxisLabel: result.categoryColumn,
    yAxisLabel: `Avg ${result.numericColumn}`,
    data: result.rows.map(r => ({
      label: r.category,
      value: r.avg_value,
      value2: r.sum_value,
    })),
    analysisType: 'group_aggregation',
    sourceColumns: [result.categoryColumn, result.numericColumn],
  };
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

export function correlationToChart(result: CorrelationResult): ChartConfig {
  return {
    chartType: 'scatter',
    availableTypes: ['scatter'],
    title: `${result.column1} vs ${result.column2} (r = ${result.correlation})`,
    xAxisLabel: result.column1,
    yAxisLabel: result.column2,
    scatterData: result.points.map(p => ({
      x: p.x,
      y: p.y,
    })),
    correlation: result.correlation,
    analysisType: 'correlation',
    sourceColumns: [result.column1, result.column2],
  };
}

export function timeSeriesToChart(result: TimeSeriesResult): ChartConfig {
  return {
    chartType: 'area',
    availableTypes: ['area', 'line', 'bar'],
    title: `${result.numericColumn} over ${result.dateColumn}`,
    xAxisLabel: result.dateColumn,
    yAxisLabel: `Avg ${result.numericColumn}`,
    data: result.points.map(p => ({
      label: p.period,
      value: p.value,
    })),
    analysisType: 'time_series',
    sourceColumns: [result.dateColumn, result.numericColumn],
  };
}
