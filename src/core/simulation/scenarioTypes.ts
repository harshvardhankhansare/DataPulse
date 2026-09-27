export type MetricKind = 'rate' | 'total' | 'average';

export interface TargetOption {
  name: string;
  label: string;
  kind: MetricKind;
  unit: string;
  description: string;
}

export interface SimulationDriver {
  name: string;
  label: string;
  currentAvg: number;
  currentSum: number;
  correlation: number;
  slope: number;
  direction: 'positive' | 'negative' | 'neutral';
  impactPerTenPercent: number;
  unit?: string;
  explanation?: string;
}

export interface DriverSensitivity {
  driverName: string;
  label: string;
  correlation: number;
  slope: number;
  direction: 'positive' | 'negative' | 'neutral';
  impactPerTenPercent: number;
  percentageImpact: number;
  elasticityRank: number;
  plainExplanation: string;
}

export interface DriverContribution {
  driverName: string;
  label: string;
  adjustmentPercent: number;
  individualDelta: number;
  shareOfChangePercent: number;
  direction: 'positive' | 'negative' | 'neutral';
}

export interface SimulationConfig {
  targetColumn: string;
  targetKind: MetricKind;
  targetLabel: string;
  targetUnit: string;
  availableTargets: TargetOption[];
  drivers: SimulationDriver[];
}

export interface SimulationResult {
  targetColumn: string;
  targetKind: MetricKind;
  targetLabel: string;
  targetUnit: string;
  baselineValue: number;
  baselineSecondaryText: string;
  projectedValue: number;
  projectedSecondaryText: string;
  deltaValue: number;
  percentChange: number;
  deltaSecondaryText: string;
  sensitivity: DriverSensitivity[];
  driverContributions?: DriverContribution[];
  summaryText?: string;
  recommendationText?: string;
}
