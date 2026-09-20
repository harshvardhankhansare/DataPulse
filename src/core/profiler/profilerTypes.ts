export interface QualityReport {
  overallScore: number;        // 0.0 - 1.0
  completeness: number;        // 0.0 - 1.0
  uniqueness: number;          // 0.0 - 1.0
  validity: number;            // 0.0 - 1.0
  consistency: number;         // 0.0 - 1.0
  issues: QualityIssue[];      // List of specific problems
}

export interface QualityIssue {
  severity: 'low' | 'medium' | 'high';
  column: string;              // Empty string for dataset-level issues
  issueType: IssueType;
  description: string;         // User-friendly message
  affectedCount: number;       // Rows or cells affected
  suggestion?: string;         // Remediation advice
}

export type IssueType =
  | 'missing_values'           // Nulls detected
  | 'duplicate_rows'           // Identical rows found
  | 'outliers'                 // Statistical outliers in numeric data
  | 'invalid_format'           // Values don't match expected pattern
  | 'inconsistent_format'      // Multiple formats in same column
  | 'high_cardinality'         // Too many distinct values for categorical
  | 'low_cardinality'          // Too few distinct values (all same)
  | 'invalid_date'             // Dates outside reasonable range
  | 'extreme_value';           // Value seems implausible
