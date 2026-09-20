import { TableSchema } from '../schema/schemaTypes.js';
import { QualityReport } from '../profiler/profilerTypes.js';
import { AnalysisTask } from '../rules/ruleTypes.js';

export type JoinType = 'LEFT' | 'INNER' | 'RIGHT' | 'FULL';

export interface LakehouseTable {
  tableName: string;
  fileName: string;
  format: string;
  rowCount: number;
  columns: { name: string; type: string }[];
}

export interface JoinCandidate {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  confidence: 'high' | 'medium';
  overlapCount: number;
  overlapPct: number;
  recommendedJoinType: JoinType;
}

export interface JoinPlan {
  leftTable: string;
  rightTable: string;
  leftColumn: string;
  rightColumn: string;
  joinType: JoinType;
  viewName: string;
}

export interface MultiImportResult {
  tables: LakehouseTable[];
  joinCandidates: JoinCandidate[];
}

export interface JoinViewResult {
  success: boolean;
  viewName: string;
  schema: TableSchema;
  quality: QualityReport;
  applicableAnalyses: AnalysisTask[];
  rowCount: number;
  error?: string;
}
