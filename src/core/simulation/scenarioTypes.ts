export interface SimulationDriver {
  name: string;
  label: string;
  currentAvg: number;
  currentSum: number;
}

export interface DriverSensitivity {
  driverName: string;
  impactPerTenPercent: number;
  percentageImpact: number;
  elasticityRank: number;
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
}
