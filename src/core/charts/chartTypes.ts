// Chart-related type definitions shared between core (selector) and renderer (ChartGrid)

export interface ChartDataPoint {
  label: string;
  value: number;
  value2?: number;
}

export interface ChartScatterPoint {
  x: number;
  y: number;
}

export type ChartType =
  | 'bar'
  | 'horizontal_bar'
  | 'line'
  | 'area'
  | 'scatter'
  | 'histogram'
  | 'pie'
  | 'donut'
  | 'radar'
  | 'funnel'
  | 'waterfall';

export interface NumericStatsSummary {
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  nullCount: number;
  totalCount: number;
}

export interface ChartConfig {
  chartType: ChartType;
  availableTypes?: ChartType[];
  title: string;
  xAxisLabel: string;
  yAxisLabel: string;
  data?: ChartDataPoint[];
  scatterData?: ChartScatterPoint[];
  correlation?: number;
  statsSummary?: NumericStatsSummary;
  analysisType: string;
  sourceColumns: string[];
}
