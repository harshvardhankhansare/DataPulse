import { AnalysisRule } from './ruleTypes.js';
import { TableSchema, ColumnType } from '../schema/schemaTypes.js';

export const ANALYSIS_RULES: AnalysisRule[] = [
  {
    id: 'descriptive_stats_numeric',
    analysisType: 'descriptive_stats',
    condition: (schema: TableSchema) =>
      schema.columns.some(col => col.detectedType === ColumnType.NUMERIC),
    priority: 1
  },
  {
    id: 'group_aggregation_categorical_numeric',
    analysisType: 'group_aggregation',
    condition: (schema: TableSchema) =>
      schema.columns.some(col => col.detectedType === ColumnType.CATEGORICAL) &&
      schema.columns.some(col => col.detectedType === ColumnType.NUMERIC),
    priority: 2
  },
  {
    id: 'correlation_multiple_numeric',
    analysisType: 'correlation',
    condition: (schema: TableSchema) =>
      schema.columns.filter(col => col.detectedType === ColumnType.NUMERIC).length >= 2,
    priority: 3
  },
  {
    id: 'time_series_date_numeric',
    analysisType: 'time_series',
    condition: (schema: TableSchema) =>
      schema.columns.some(col => col.detectedType === ColumnType.DATE) &&
      schema.columns.some(col => col.detectedType === ColumnType.NUMERIC),
    priority: 4
  }
];
