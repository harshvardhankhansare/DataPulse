import { ChartConfig } from '../charts/chartTypes.js';

export type ImpactType = 'drag' | 'boost' | 'neutral';

export interface VarianceDriver {
  name: string;
  baselineValue: number;
  comparisonValue: number;
  absoluteDelta: number;
  percentageChange: number;
  contributionPct: number;
  impact: ImpactType;
}

export interface InvestigationStep {
  stepNumber: number;
  title: string;
  sql: string;
  executionMs: number;
  rowCount: number;
  discovery: string;
}

export interface ExecutiveSummary {
  headline: string;
  primaryRootCause: string;
  mitigatingFactors: string;
  actionableRecommendations: string[];
}

export interface DiagnosticReport {
  targetMetric: string;
  dimension: string;
  totalBaseline: number;
  totalComparison: number;
  netDelta: number;
  netPercentageChange: number;
  primaryDriver: VarianceDriver;
  drivers: VarianceDriver[];
  steps: InvestigationStep[];
  waterfallChart: ChartConfig;
  executiveSummary: ExecutiveSummary;
  generatedAt: string;
}

export interface DiagnosticTargetOption {
  metric: string;
  dimensions: string[];
  suggestedQuestions: string[];
}
