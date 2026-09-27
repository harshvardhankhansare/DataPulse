export interface SimulationDriver {
  name: string;
  label: string;
  currentAvg: number;
  currentSum: number;
  correlation: number;
  slope: number;
  direction: 'positive' | 'negative' | 'neutral';
  impactPerTenPercent: number;
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
  availableTargets: string[];
  drivers: SimulationDriver[];
}

export interface SimulationResult {
  targetColumn: string;
  baselineTotal: number;
  baselineAvg: number;
  projectedTotal: number;
  projectedAvg: number;
  deltaTotal: number;
  percentChange: number;
  sensitivity: DriverSensitivity[];
  driverContributions?: DriverContribution[];
  summaryText?: string;
  recommendationText?: string;
}
