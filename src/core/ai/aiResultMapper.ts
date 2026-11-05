import { ChartConfig } from '../charts/chartTypes.js';

export function mapAiResultToChart(
  question: string,
  rows: Record<string, unknown>[]
): ChartConfig | null {
  if (!rows || rows.length === 0 || rows.length > 50) return null;

  const firstRow = rows[0];
  const keys = Object.keys(firstRow);
  if (keys.length < 2) return null;

  // Identify first string/date column as label, and first numeric column as value
  const labelKey = keys.find(k => typeof firstRow[k] === 'string' || firstRow[k] instanceof Date) || keys[0];
  const valueKey = keys.find(k => k !== labelKey && (typeof firstRow[k] === 'number' || typeof firstRow[k] === 'bigint'));

  if (!valueKey) return null;

  const isDate = /date|time|year|month|day/i.test(labelKey);

  return {
    chartType: isDate ? 'line' : 'bar',
    availableTypes: isDate
      ? ['line', 'area', 'bar']
      : ['bar', 'horizontal_bar', 'donut', 'pie', 'funnel', 'radar'],
    title: question,
    xAxisLabel: labelKey,
    yAxisLabel: valueKey,
    data: rows.map(r => ({
      label: String(r[labelKey] ?? 'Unknown'),
      value: Number(r[valueKey] ?? 0),
    })),
    analysisType: 'ai_query',
    sourceColumns: [labelKey, valueKey],
  };
}
