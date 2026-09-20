import { TableSchema } from '../schema/schemaTypes.js';

export type AnalysisType =
  | 'descriptive_stats'
  | 'group_aggregation'
  | 'correlation'
  | 'time_series';

export interface AnalysisRule {
  id: string;                          // e.g., "descriptive_stats_numeric"
  analysisType: AnalysisType;
  condition: (schema: TableSchema) => boolean;  // Predicate function
  priority: number;                     // Execution order (1 = highest)
}

export interface AnalysisTask {
  analysisType: AnalysisType;
  ruleId: string;                       // Which rule triggered this task
}
