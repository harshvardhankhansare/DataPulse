export type InsightType = 'trend' | 'comparison' | 'outlier' | 'summary' | 'correlation';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface Insight {
  id: string;
  text: string;
  evidenceQuery: string;
  sourceColumns: string[];
  insightType: InsightType;
  confidence: ConfidenceLevel;
  metadata?: {
    analysisType: string;
    values?: Record<string, number | string>;
  };
}
