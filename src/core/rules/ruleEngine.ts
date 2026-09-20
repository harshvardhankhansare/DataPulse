import { TableSchema } from '../schema/schemaTypes.js';
import { AnalysisTask } from './ruleTypes.js';
import { ANALYSIS_RULES } from './ruleDefinitions.js';

/**
 * Select which analyses are applicable based on the detected schema
 * @param schema - The detected table schema
 * @returns Array of analysis tasks that can be executed
 */
export function selectApplicableAnalyses(schema: TableSchema): AnalysisTask[] {
  // Filter rules where condition is met
  const applicableRules = ANALYSIS_RULES.filter(rule => rule.condition(schema));

  // Sort by priority (lower number = higher priority)
  applicableRules.sort((a, b) => a.priority - b.priority);

  // Map to tasks
  return applicableRules.map(rule => ({
    analysisType: rule.analysisType,
    ruleId: rule.id
  }));
}
