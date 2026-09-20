export interface ExecutiveKpi {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  description: string;
}

export interface BriefingSection {
  title: string;
  subtitle: string;
  narrative: string;
  bulletPoints: string[];
  metrics?: { label: string; value: string }[];
}

export interface ExecutiveBriefing {
  title: string;
  datasetName: string;
  generatedDate: string;
  qualityScore: number;
  qualityStatus: 'Excellent' | 'Good' | 'Fair' | 'Needs Attention';
  macroKpis: ExecutiveKpi[];
  executiveSummary: string;
  strategicFindings: BriefingSection;
  operationalVariance: BriefingSection;
  governanceAndPrivacy: BriefingSection;
  actionableDecisions: string[];
}
