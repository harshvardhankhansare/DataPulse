import { ipcMain } from 'electron';
import { detectSchema } from '../../core/schema/typeDetector.js';
import { runGroupAggregation } from '../../core/analytics/groupAggregation.js';
import { runDescriptiveStats } from '../../core/analytics/descriptiveStats.js';
import { runCorrelation } from '../../core/analytics/correlation.js';
import { runTimeSeries } from '../../core/analytics/timeSeries.js';
import {
  groupAggregationToChart,
  descriptiveStatsToChart,
  correlationToChart,
  timeSeriesToChart,
} from '../../core/charts/chartSelector.js';
import {
  generateGroupAggregationInsights,
  generateDescriptiveStatsInsights,
  generateCorrelationInsights,
  generateTimeSeriesInsights,
} from '../../core/insights/insightGenerator.js';
import { ActiveFilter } from '../../core/analytics/filterTypes.js';

export function registerAnalyticsHandlers(query: (sql: string) => Promise<any[]>) {
  ipcMain.handle('run-analysis', async (_event, tableName: string, analysisType: string, filter?: ActiveFilter) => {
    try {
      const schema = await detectSchema(tableName, query);

      if (analysisType === 'group_aggregation') {
        const result = await runGroupAggregation(tableName, schema, query, filter);
        const chartConfig = groupAggregationToChart(result);
        const insights = generateGroupAggregationInsights(tableName, result, schema);
        return { success: true, chartConfig, insights };
      }

      if (analysisType === 'descriptive_stats') {
        const result = await runDescriptiveStats(tableName, schema, query, filter);
        const chartConfig = descriptiveStatsToChart(result);
        const insights = generateDescriptiveStatsInsights(tableName, result, schema);
        return { success: true, chartConfig, insights };
      }

      if (analysisType === 'correlation') {
        const result = await runCorrelation(tableName, schema, query, filter);
        const chartConfig = correlationToChart(result);
        const insights = generateCorrelationInsights(tableName, result, schema);
        return { success: true, chartConfig, insights };
      }

      if (analysisType === 'time_series') {
        const result = await runTimeSeries(tableName, schema, query, filter);
        const chartConfig = timeSeriesToChart(result);
        const insights = generateTimeSeriesInsights(tableName, result, schema);
        return { success: true, chartConfig, insights };
      }

      return { success: false, error: `Analysis type "${analysisType}" not recognized` };
    } catch (error) {
      console.error('Analysis failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
