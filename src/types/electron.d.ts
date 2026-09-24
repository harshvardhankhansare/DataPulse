import { TableSchema } from '@core/schema/schemaTypes';
import { QualityReport } from '@core/profiler/profilerTypes';
import { AnalysisTask } from '@core/rules/ruleTypes';
import { ChartConfig } from '@core/charts/chartTypes';
import { Insight } from '@core/insights/insightTypes';
import { ActiveFilter } from '@core/analytics/filterTypes';
import { SimulationConfig, SimulationResult } from '@core/simulation/scenarioTypes';
import { PrivacyAuditReport, AirGapStatus, MaskingStrategy, PiiCategory } from '@core/privacy/privacyTypes';
import { DiagnosticReport, DiagnosticTargetOption } from '@core/diagnostic/diagnosticTypes';
import { ExecutiveBriefing } from '@core/reporting/reportingTypes';
import {
  LakehouseTable,
  JoinCandidate,
  JoinPlan,
  JoinViewResult,
} from '@core/lakehouse/lakehouseTypes';

export interface ElectronAPI {
  selectFile: () => Promise<string | null>;
  selectCsvFile: () => Promise<string | null>;
  importFile: (filePath: string) => Promise<{
    success: boolean;
    schema?: TableSchema;
    quality?: QualityReport;
    applicableAnalyses?: AnalysisTask[];
    format?: string;
    error?: string;
  }>;
  importCsv: (filePath: string) => Promise<{
    success: boolean;
    schema?: TableSchema;
    quality?: QualityReport;
    applicableAnalyses?: AnalysisTask[];
    format?: string;
    error?: string;
  }>;
  runAnalysis: (tableName: string, analysisType: string, filter?: ActiveFilter) => Promise<{
    success: boolean;
    chartConfig?: ChartConfig;
    insights?: Insight[];
    error?: string;
  }>;
  checkAiStatus: (customUrl?: string) => Promise<{
    available: boolean;
    provider: string;
    endpoint: string;
    modelName?: string;
    error?: string;
  }>;
  queryAi: (tableName: string, question: string, customUrl?: string) => Promise<{
    success: boolean;
    sql?: string;
    rows?: any[];
    chartConfig?: ChartConfig | null;
    error?: string;
  }>;
  getSimulationConfig: (tableName: string) => Promise<{
    success: boolean;
    config?: SimulationConfig;
    error?: string;
  }>;
  runSimulation: (tableName: string, targetCol: string, adjustments: Record<string, number>, filter?: ActiveFilter) => Promise<{
    success: boolean;
    result?: SimulationResult;
    error?: string;
  }>;
  scanPii: (tableName: string) => Promise<{
    success: boolean;
    report?: PrivacyAuditReport;
    error?: string;
  }>;
  applyMasking: (
    tableName: string,
    columnRules: Record<string, { category: PiiCategory; strategy: MaskingStrategy }>
  ) => Promise<{
    success: boolean;
    isMasked?: boolean;
    error?: string;
  }>;
  revertMasking: (tableName: string) => Promise<{
    success: boolean;
    isMasked?: boolean;
    error?: string;
  }>;
  purgeMemory: () => Promise<{
    success: boolean;
    receipt?: any;
    error?: string;
  }>;
  getAirGapStatus: () => Promise<{
    success: boolean;
    status?: AirGapStatus;
    error?: string;
  }>;
  getDiagnosticTargets: (tableName: string) => Promise<{
    success: boolean;
    targets?: DiagnosticTargetOption[];
    error?: string;
  }>;
  runDiagnosticInvestigation: (
    tableName: string,
    targetCol?: string,
    dimensionCol?: string,
    question?: string
  ) => Promise<{
    success: boolean;
    report?: DiagnosticReport;
    error?: string;
  }>;
  generateBriefing: (
    tableName: string,
    fileName?: string,
    quality?: QualityReport | null,
    insights?: Insight[]
  ) => Promise<{
    success: boolean;
    briefing?: ExecutiveBriefing;
    error?: string;
  }>;
  exportBriefingHtml: (
    briefing: ExecutiveBriefing,
    chartImages?: Record<string, string>
  ) => Promise<{
    success: boolean;
    filePath?: string;
    error?: string;
  }>;
  exportBriefingPdf: (datasetName?: string) => Promise<{
    success: boolean;
    filePath?: string;
    error?: string;
  }>;
  selectMultipleFiles: () => Promise<string[] | null>;
  importMultipleFiles: (filePaths: string[]) => Promise<{
    success: boolean;
    tables?: LakehouseTable[];
    joinCandidates?: JoinCandidate[];
    error?: string;
  }>;
  detectJoinCandidates: (tables: LakehouseTable[]) => Promise<{
    success: boolean;
    candidates?: JoinCandidate[];
    error?: string;
  }>;
  createJoinView: (plan: JoinPlan) => Promise<JoinViewResult>;
  getTableRows: (tableName: string, limit?: number, offset?: number, search?: string) => Promise<{
    success: boolean;
    rows?: any[];
    totalCount?: number;
    columns?: string[];
    error?: string;
  }>;
  updateCell: (tableName: string, rowid: number, column: string, value: any) => Promise<{
    success: boolean;
    error?: string;
  }>;
  deleteRow: (tableName: string, rowid: number) => Promise<{
    success: boolean;
    error?: string;
  }>;
  cleanData: (tableName: string, action: 'remove_duplicates' | 'fill_nulls_zero' | 'trim_spaces') => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;
  exportCleanedCsv: (tableName: string, defaultName?: string) => Promise<{
    success: boolean;
    filePath?: string;
    canceled?: boolean;
    error?: string;
  }>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
