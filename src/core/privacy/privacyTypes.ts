export type PiiCategory =
  | 'email'
  | 'phone'
  | 'credit_card'
  | 'ssn'
  | 'ip_address'
  | 'financial'
  | 'name'
  | 'address'
  | 'custom';

export type MaskingStrategy = 'partial' | 'redact' | 'hash' | 'nullify' | 'none';

export type PiiConfidence = 'high' | 'medium' | 'low';

export interface PiiDetection {
  column: string;
  category: PiiCategory;
  confidence: PiiConfidence;
  matchCount: number;
  sampleOriginal: string;
  sampleMasked: string;
  recommendedStrategy: MaskingStrategy;
}

export type RiskLevel = 'SAFE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface PrivacyAuditReport {
  tableName: string;
  totalColumns: number;
  piiColumnsCount: number;
  detections: PiiDetection[];
  riskLevel: RiskLevel;
  complianceFlags: {
    gdprImpact: boolean;
    hipaaImpact: boolean;
    pciDssImpact: boolean;
    soc2Impact: boolean;
  };
  isMasked: boolean;
  scannedAt: string;
}

export interface AirGapStatus {
  isAirGapped: boolean;
  outboundRequestsCount: number;
  storageMode: '100% In-Memory RAM (DuckDB)';
  activeSessionDurationSec: number;
  tableCount: number;
  allocatedMemoryMb: number;
}
