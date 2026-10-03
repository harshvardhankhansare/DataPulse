import { ipcMain } from 'electron';
import { detectSchema } from '../../core/schema/typeDetector.js';
import { runGroupAggregation } from '../../core/analytics/groupAggregation.js';
import { runDescriptiveStats } from '../../core/analytics/descriptiveStats.js';
import { runCorrelation } from '../../core/analytics/correlation.js';
import { runTimeSeries } from '../../core/analytics/timeSeries.js';
import {
  groupAggregationToCharts,
  descriptiveStatsToChart,
  correlationToCharts,
  timeSeriesToCharts,
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
        const results = await runGroupAggregation(tableName, schema, query, filter);
        const chartConfigs = groupAggregationToCharts(results);
        const insights = results.flatMap(r => generateGroupAggregationInsights(tableName, r, schema));
        return { success: true, chartConfigs, insights };
      }

      if (analysisType === 'descriptive_stats') {
        const result = await runDescriptiveStats(tableName, schema, query, filter);
        const chartConfig = descriptiveStatsToChart(result);
        const insights = generateDescriptiveStatsInsights(tableName, result, schema);
        return { success: true, chartConfig, insights };
      }

      if (analysisType === 'correlation') {
        const results = await runCorrelation(tableName, schema, query, filter);
        const chartConfigs = correlationToCharts(results);
        const insights = results.flatMap(r => generateCorrelationInsights(tableName, r, schema));
        return { success: true, chartConfigs, insights };
      }

      if (analysisType === 'time_series') {
        const results = await runTimeSeries(tableName, schema, query, filter);
        const chartConfigs = timeSeriesToCharts(results);
        const insights = results.flatMap(r => generateTimeSeriesInsights(tableName, r, schema));
        return { success: true, chartConfigs, insights };
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
