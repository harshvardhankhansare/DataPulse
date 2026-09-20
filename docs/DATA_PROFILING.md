# Data Profiling

## 1. Overview

This document describes the data quality profiling system that analyzes imported datasets to provide quality metrics, identify issues, and inform which analyses are applicable.

## 2. Purpose & Goals

### 2.1 Why Profile Data?

**Before analysis, we need to understand:**
1. **Completeness:** Are there missing values that would bias results?
2. **Quality:** Is the data reliable enough for meaningful analysis?
3. **Characteristics:** What patterns exist (outliers, duplicates, inconsistencies)?
4. **Applicability:** Which analysis types make sense for this dataset?

**Benefits:**
- Warn users about data quality issues before they draw conclusions
- Skip inapplicable analyses automatically (e.g., no correlation without 2+ numeric columns)
- Provide evidence for insight validity (explainability for project viva)
- Surface data cleaning needs

### 2.2 Profiling vs. Analysis

**Profiling (this module):**
- Descriptive: "What is this data?"
- Focuses on quality and structure
- Always runs (mandatory step)
- Output: quality scores + issues list

**Analysis (analytics module):**
- Investigative: "What does this data tell us?"
- Focuses on patterns and relationships
- Conditional (based on schema + rules)
- Output: statistics + insights

## 3. Quality Dimensions

### 3.1 The Four Quality Metrics

We measure quality across four dimensions, following data quality frameworks (DAMA, ISO 8000):

```
Overall Quality Score = (Completeness + Uniqueness + Validity + Consistency) / 4
```

Each dimension scored 0.0 (worst) to 1.0 (perfect).

#### 3.1.1 Completeness

**Definition:** Proportion of non-null values across all cells.

**Formula:**
```
Completeness = (Total Cells - Null Cells) / Total Cells
```

**Why it matters:**
- Missing values can skew statistical results
- Many analyses require complete cases
- High missingness may indicate data collection issues

**Measurement:**
```sql
-- Per column
SELECT 
  column_name,
  COUNT(*) as total_rows,
  COUNT(column_name) as non_null_count,
  COUNT(column_name) * 1.0 / COUNT(*) as completeness
FROM dataset;

-- Overall
SELECT 
  SUM(column_count * row_count - null_count) * 1.0 / 
  SUM(column_count * row_count) as overall_completeness
FROM (
  -- For each column, count nulls
  SELECT COUNT(*) as row_count, COUNT(col) as non_null_count, 
         COUNT(*) - COUNT(col) as null_count
  FROM dataset
);
```

**Thresholds:**
- 1.0 = Perfect (no missing values)
- 0.9-0.99 = Excellent (< 10% missing)
- 0.7-0.89 = Acceptable (10-30% missing)
- < 0.7 = Poor (> 30% missing, consider data cleaning)

#### 3.1.2 Uniqueness

**Definition:** Proportion of distinct values, accounting for duplicate rows.

**Formula:**
```
Uniqueness = Average(Column Distinct Ratios) - Duplicate Row Penalty
```

**Why it matters:**
- Duplicate rows indicate data entry errors or import issues
- Low uniqueness in key columns (IDs) indicates quality problems
- High uniqueness in categories may indicate data granularity issues

**Measurement:**
```sql
-- Distinct ratio per column (already in schema detection)
SELECT 
  COUNT(DISTINCT column_name) * 1.0 / COUNT(*) as distinct_ratio
FROM dataset;

-- Duplicate rows
SELECT 
  COUNT(*) - COUNT(DISTINCT *) as duplicate_count
FROM dataset;

-- Uniqueness score
Uniqueness = AVG(distinct_ratios) * (1 - duplicate_count / total_rows)
```

**Thresholds:**
- 1.0 = Perfect (all unique values, no duplicate rows)
- 0.8-0.99 = Good (some repeated values expected)
- 0.5-0.79 = Fair (high repetition, verify intended)
- < 0.5 = Poor (investigate duplicate issues)

#### 3.1.3 Validity

**Definition:** Proportion of values conforming to expected formats and ranges.

**Formula:**
```
Validity = Average(Per-Column Validity Scores)
```

**Why it matters:**
- Invalid values cause query errors or incorrect results
- Indicates data entry mistakes or format mismatches
- Outliers may be valid but unusual values worth investigating

**Measurement (type-specific):**

**For NUMERIC columns:**
```sql
-- Outlier detection (values beyond Q1 - 3*IQR or Q3 + 3*IQR)
WITH stats AS (
  SELECT 
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY numeric_col) as q1,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY numeric_col) as q3
  FROM dataset
),
bounds AS (
  SELECT 
    q1,
    q3,
    q1 - 3 * (q3 - q1) as lower_bound,
    q3 + 3 * (q3 - q1) as upper_bound
  FROM stats
)
SELECT 
  COUNT(CASE WHEN numeric_col >= lower_bound AND numeric_col <= upper_bound 
             THEN 1 END) * 1.0 / COUNT(*) as validity
FROM dataset, bounds
WHERE numeric_col IS NOT NULL;
```

**For DATE/DATETIME columns:**
```sql
-- Check for invalid dates (e.g., year 9999, nonsensical dates)
SELECT 
  COUNT(CASE WHEN date_col >= '1900-01-01' AND date_col <= '2100-12-31' 
             THEN 1 END) * 1.0 / COUNT(*) as validity
FROM dataset
WHERE date_col IS NOT NULL;
```

**For BOOLEAN columns:**
```sql
-- Check if values are in expected set
SELECT 
  COUNT(CASE WHEN bool_col IN (true, false, 1, 0, 'yes', 'no', 'Y', 'N', 't', 'f')
             THEN 1 END) * 1.0 / COUNT(*) as validity
FROM dataset
WHERE bool_col IS NOT NULL;
```

**For TEXT/CATEGORICAL columns:**
- Length checks: `LENGTH(text_col) < 10000` (reject suspiciously long strings)
- Character set: `text_col !~ '[^\x20-\x7E]'` (reject control characters)

**Thresholds:**
- 1.0 = All values valid
- 0.95-0.99 = Excellent (< 5% invalid, likely acceptable)
- 0.8-0.94 = Fair (5-20% invalid, investigate)
- < 0.8 = Poor (> 20% invalid, data cleaning required)

#### 3.1.4 Consistency

**Definition:** Uniformity of format and representation within columns.

**Formula:**
```
Consistency = Average(Per-Column Format Consistency Scores)
```

**Why it matters:**
- Inconsistent formats complicate analysis (e.g., "USA" vs "United States")
- Indicates multiple data sources or entry methods
- Affects grouping and aggregation results

**Measurement:**

**For DATE columns:**
```sql
-- Check if all dates use same format (ISO 8601 preferred)
WITH formats AS (
  SELECT 
    CASE 
      WHEN date_col ~ '^\d{4}-\d{2}-\d{2}$' THEN 'ISO'
      WHEN date_col ~ '^\d{2}/\d{2}/\d{4}$' THEN 'US'
      WHEN date_col ~ '^\d{2}\.\d{2}\.\d{4}$' THEN 'EU'
      ELSE 'OTHER'
    END as format
  FROM dataset
  WHERE date_col IS NOT NULL
)
SELECT 
  COUNT(DISTINCT format) as format_count,
  MAX(COUNT(*)) OVER () * 1.0 / SUM(COUNT(*)) OVER () as consistency
FROM formats
GROUP BY format;
-- consistency = (most common format count) / (total non-null count)
```

**For TEXT/CATEGORICAL columns:**
```sql
-- Check case consistency
WITH case_patterns AS (
  SELECT 
    CASE 
      WHEN text_col = UPPER(text_col) THEN 'UPPER'
      WHEN text_col = LOWER(text_col) THEN 'lower'
      WHEN text_col = INITCAP(text_col) THEN 'Title'
      ELSE 'Mixed'
    END as case_pattern
  FROM dataset
  WHERE text_col IS NOT NULL
)
SELECT 
  MAX(COUNT(*)) * 1.0 / SUM(COUNT(*)) OVER () as consistency
FROM case_patterns
GROUP BY case_pattern;
```

**For NUMERIC columns:**
```sql
-- Check decimal precision consistency (all integers vs. all decimals)
SELECT 
  COUNT(CASE WHEN numeric_col = FLOOR(numeric_col) THEN 1 END) * 1.0 / 
  COUNT(*) as integer_ratio
FROM dataset
WHERE numeric_col IS NOT NULL;
-- Consistency = MAX(integer_ratio, 1 - integer_ratio)
-- i.e., score high if all integers OR all decimals, low if mixed
```

**Thresholds:**
- 1.0 = Perfectly consistent format
- 0.9-0.99 = Mostly consistent (minor variations acceptable)
- 0.7-0.89 = Inconsistent (multiple formats present)
- < 0.7 = Very inconsistent (data cleaning recommended)

### 3.2 Aggregate Score Calculation

```typescript
interface QualityReport {
  overallScore: number;        // 0.0 - 1.0
  completeness: number;        // 0.0 - 1.0
  uniqueness: number;          // 0.0 - 1.0
  validity: number;            // 0.0 - 1.0
  consistency: number;         // 0.0 - 1.0
  issues: QualityIssue[];      // List of specific problems
}

function calculateOverallScore(metrics: QualityMetrics): number {
  return (
    metrics.completeness * 0.25 +
    metrics.uniqueness * 0.25 +
    metrics.validity * 0.25 +
    metrics.consistency * 0.25
  );
}
```

**Equal weighting rationale:**
- All four dimensions equally important for analytics
- No single dimension dominates
- Simplifies interpretation (each contributes 25%)

**Alternative weighting (future):**
- User-configurable weights based on domain
- E.g., completeness weighted higher for statistical analysis
- E.g., consistency weighted higher for reporting

## 4. Issue Detection

### 4.1 Quality Issue Types

```typescript
interface QualityIssue {
  severity: 'low' | 'medium' | 'high';
  column: string;              // Empty string for dataset-level issues
  issueType: IssueType;
  description: string;         // User-friendly message
  affectedCount: number;       // Rows or cells affected
  suggestion?: string;         // Remediation advice
}

type IssueType =
  | 'missing_values'           // Nulls detected
  | 'duplicate_rows'           // Identical rows found
  | 'outliers'                 // Statistical outliers in numeric data
  | 'invalid_format'           // Values don't match expected pattern
  | 'inconsistent_format'      // Multiple formats in same column
  | 'high_cardinality'         // Too many distinct values for categorical
  | 'low_cardinality'          // Too few distinct values (all same)
  | 'invalid_date'             // Dates outside reasonable range
  | 'extreme_value';           // Value seems implausible
```

### 4.2 Severity Assignment

**High Severity** (blocks or invalidates analysis):
- Missing values > 50% in any column
- Duplicate rows > 20% of dataset
- Invalid format > 20% in any column
- All values identical in a numeric column (no variance)

**Medium Severity** (affects analysis quality):
- Missing values 20-50% in any column
- Duplicate rows 5-20%
- Invalid format 5-20%
- Outliers > 10% of values
- Inconsistent formats across columns

**Low Severity** (informational, may be acceptable):
- Missing values < 20%
- Duplicate rows < 5%
- Minor format inconsistencies
- Few outliers (< 5%)

### 4.3 Issue Detection Logic

**Missing Values:**
```typescript
async function detectMissingValues(
  db: Database,
  tableName: string,
  schema: Schema
): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = [];
  
  for (const column of schema.columns) {
    const missingPct = (column.nullCount / schema.totalRows) * 100;
    
    if (missingPct > 50) {
      issues.push({
        severity: 'high',
        column: column.name,
        issueType: 'missing_values',
        description: `Column "${column.name}" has ${missingPct.toFixed(1)}% missing values`,
        affectedCount: column.nullCount,
        suggestion: 'Consider removing this column or imputing missing values'
      });
    } else if (missingPct > 20) {
      issues.push({
        severity: 'medium',
        column: column.name,
        issueType: 'missing_values',
        description: `Column "${column.name}" has ${missingPct.toFixed(1)}% missing values`,
        affectedCount: column.nullCount,
        suggestion: 'Some analyses may exclude rows with missing values'
      });
    }
  }
  
  return issues;
}
```

**Duplicate Rows:**
```typescript
async function detectDuplicates(
  db: Database,
  tableName: string,
  totalRows: number
): Promise<QualityIssue[]> {
  const result = await db.prepare(`
    SELECT COUNT(*) - COUNT(DISTINCT *) as duplicate_count
    FROM ${tableName}
  `).get();
  
  const duplicateCount = result.duplicate_count;
  const duplicatePct = (duplicateCount / totalRows) * 100;
  
  if (duplicatePct === 0) {
    return [];
  }
  
  const severity = duplicatePct > 20 ? 'high' : duplicatePct > 5 ? 'medium' : 'low';
  
  return [{
    severity,
    column: '',  // Dataset-level issue
    issueType: 'duplicate_rows',
    description: `${duplicateCount} duplicate rows found (${duplicatePct.toFixed(1)}% of dataset)`,
    affectedCount: duplicateCount,
    suggestion: 'Review data source for import errors or intentional duplicates'
  }];
}
```

**Outliers (Numeric Columns):**
```typescript
async function detectOutliers(
  db: Database,
  tableName: string,
  column: ColumnInfo
): Promise<QualityIssue[]> {
  if (column.detectedType !== 'NUMERIC') {
    return [];
  }
  
  const result = await db.prepare(`
    WITH stats AS (
      SELECT 
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY "${column.name}") as q1,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "${column.name}") as q3
      FROM ${tableName}
    ),
    bounds AS (
      SELECT 
        q1 - 3 * (q3 - q1) as lower_bound,
        q3 + 3 * (q3 - q1) as upper_bound
      FROM stats
    )
    SELECT COUNT(*) as outlier_count
    FROM ${tableName}, bounds
    WHERE "${column.name}" < lower_bound OR "${column.name}" > upper_bound
  `).get();
  
  const outlierCount = result.outlier_count;
  const outlierPct = (outlierCount / (totalRows - column.nullCount)) * 100;
  
  if (outlierCount === 0) {
    return [];
  }
  
  const severity = outlierPct > 10 ? 'medium' : 'low';
  
  return [{
    severity,
    column: column.name,
    issueType: 'outliers',
    description: `Column "${column.name}" has ${outlierCount} outliers (${outlierPct.toFixed(1)}%)`,
    affectedCount: outlierCount,
    suggestion: 'Review outliers to determine if they are errors or genuine extreme values'
  }];
}
```

## 5. Implementation

### 5.1 Core Function

```typescript
// src/core/profiler/qualityScore.ts
import { Database } from 'duckdb';
import { Schema, ColumnInfo } from '../schema/schemaTypes';

export interface QualityReport {
  overallScore: number;
  completeness: number;
  uniqueness: number;
  validity: number;
  consistency: number;
  issues: QualityIssue[];
}

export async function profileQuality(
  db: Database,
  tableName: string,
  schema: Schema
): Promise<QualityReport> {
  // Calculate four quality dimensions
  const completeness = await calculateCompleteness(db, tableName, schema);
  const uniqueness = await calculateUniqueness(db, tableName, schema);
  const validity = await calculateValidity(db, tableName, schema);
  const consistency = await calculateConsistency(db, tableName, schema);
  
  // Aggregate score
  const overallScore = (completeness + uniqueness + validity + consistency) / 4;
  
  // Detect issues
  const issues = await detectIssues(db, tableName, schema);
  
  return {
    overallScore,
    completeness,
    uniqueness,
    validity,
    consistency,
    issues
  };
}
```

### 5.2 Completeness Calculation

```typescript
async function calculateCompleteness(
  db: Database,
  tableName: string,
  schema: Schema
): Promise<number> {
  const totalCells = schema.totalRows * schema.columns.length;
  
  // Sum null counts across all columns
  const nullCells = schema.columns.reduce((sum, col) => sum + col.nullCount, 0);
  
  const nonNullCells = totalCells - nullCells;
  
  return nonNullCells / totalCells;
}
```

### 5.3 Uniqueness Calculation

```typescript
async function calculateUniqueness(
  db: Database,
  tableName: string,
  schema: Schema
): Promise<number> {
  // Average distinct ratio across columns
  const avgDistinctRatio = schema.columns
    .reduce((sum, col) => sum + col.distinctRatio, 0) / schema.columns.length;
  
  // Penalty for duplicate rows
  const result = await db.prepare(`
    SELECT COUNT(*) - COUNT(DISTINCT *) as duplicate_count
    FROM ${tableName}
  `).get();
  
  const duplicatePenalty = result.duplicate_count / schema.totalRows;
  
  return Math.max(0, avgDistinctRatio * (1 - duplicatePenalty));
}
```

### 5.4 Validity Calculation

```typescript
async function calculateValidity(
  db: Database,
  tableName: string,
  schema: Schema
): Promise<number> {
  const validityScores: number[] = [];
  
  for (const column of schema.columns) {
    let colValidity = 1.0;  // Default: all valid
    
    switch (column.detectedType) {
      case 'NUMERIC':
        colValidity = await checkNumericValidity(db, tableName, column);
        break;
      case 'DATE':
      case 'DATETIME':
        colValidity = await checkDateValidity(db, tableName, column);
        break;
      case 'BOOLEAN':
        colValidity = await checkBooleanValidity(db, tableName, column);
        break;
      default:
        // TEXT, CATEGORICAL, IDENTIFIER: no specific validity check
        colValidity = 1.0;
    }
    
    validityScores.push(colValidity);
  }
  
  return validityScores.reduce((sum, score) => sum + score, 0) / validityScores.length;
}

async function checkNumericValidity(
  db: Database,
  tableName: string,
  column: ColumnInfo
): Promise<number> {
  const result = await db.prepare(`
    WITH stats AS (
      SELECT 
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY "${column.name}") as q1,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "${column.name}") as q3
      FROM ${tableName}
    ),
    bounds AS (
      SELECT 
        q1 - 3 * (q3 - q1) as lower_bound,
        q3 + 3 * (q3 - q1) as upper_bound
      FROM stats
    )
    SELECT 
      COUNT(CASE WHEN "${column.name}" >= lower_bound AND "${column.name}" <= upper_bound 
                 THEN 1 END) * 1.0 / COUNT(*) as validity
    FROM ${tableName}, bounds
    WHERE "${column.name}" IS NOT NULL
  `).get();
  
  return result.validity;
}

async function checkDateValidity(
  db: Database,
  tableName: string,
  column: ColumnInfo
): Promise<number> {
  const result = await db.prepare(`
    SELECT 
      COUNT(CASE WHEN "${column.name}" >= '1900-01-01' AND "${column.name}" <= '2100-12-31'
                 THEN 1 END) * 1.0 / COUNT(*) as validity
    FROM ${tableName}
    WHERE "${column.name}" IS NOT NULL
  `).get();
  
  return result.validity;
}
```

### 5.5 Consistency Calculation

```typescript
async function calculateConsistency(
  db: Database,
  tableName: string,
  schema: Schema
): Promise<number> {
  const consistencyScores: number[] = [];
  
  for (const column of schema.columns) {
    // Simplified consistency: check if column has reasonable variance
    // Full implementation would check format patterns
    
    if (column.detectedType === 'NUMERIC') {
      // Check if all integers or all decimals (consistent precision)
      const result = await db.prepare(`
        SELECT 
          COUNT(CASE WHEN "${column.name}" = FLOOR("${column.name}") THEN 1 END) * 1.0 /
          COUNT(*) as integer_ratio
        FROM ${tableName}
        WHERE "${column.name}" IS NOT NULL
      `).get();
      
      const integerRatio = result.integer_ratio;
      // High consistency if mostly integers OR mostly decimals
      const score = Math.max(integerRatio, 1 - integerRatio);
      consistencyScores.push(score);
      
    } else {
      // For other types, assume consistent (placeholder)
      consistencyScores.push(1.0);
    }
  }
  
  return consistencyScores.reduce((sum, s) => sum + s, 0) / consistencyScores.length;
}
```

## 6. UI Integration

### 6.1 Quality Score Display

**Quality Card Component (`src/renderer/components/QualityCard.tsx`):**

```tsx
interface QualityCardProps {
  quality: QualityReport;
}

export function QualityCard({ quality }: QualityCardProps) {
  const scoreColor = quality.overallScore >= 0.8 ? 'text-green-600' :
                     quality.overallScore >= 0.6 ? 'text-yellow-600' :
                     'text-red-600';
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Data Quality</h2>
      
      <div className={`text-4xl font-bold ${scoreColor} mb-4`}>
        {(quality.overallScore * 100).toFixed(0)}%
      </div>
      
      <div className="space-y-2">
        <QualityMetric label="Completeness" value={quality.completeness} />
        <QualityMetric label="Uniqueness" value={quality.uniqueness} />
        <QualityMetric label="Validity" value={quality.validity} />
        <QualityMetric label="Consistency" value={quality.consistency} />
      </div>
      
      {quality.issues.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Issues Detected:</h3>
          <IssueList issues={quality.issues} />
        </div>
      )}
    </div>
  );
}
```

### 6.2 Issue List Display

```tsx
function IssueList({ issues }: { issues: QualityIssue[] }) {
  return (
    <ul className="space-y-2">
      {issues.map((issue, idx) => (
        <li key={idx} className="flex items-start space-x-2">
          <IssueSeverityIcon severity={issue.severity} />
          <div>
            <p className="text-sm">{issue.description}</p>
            {issue.suggestion && (
              <p className="text-xs text-gray-500 mt-1">💡 {issue.suggestion}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

## 7. Testing Strategy

### 7.1 Test Scenarios

**Test 1: Perfect Quality Dataset**
- No nulls, no duplicates, valid formats, consistent
- Expected: Overall score = 1.0, no issues

**Test 2: High Missingness**
- 60% nulls in one column
- Expected: High severity issue, completeness < 0.5

**Test 3: Duplicate Rows**
- 30% duplicate rows
- Expected: High severity issue, uniqueness < 0.8

**Test 4: Outliers**
- 15% values > Q3 + 3*IQR in numeric column
- Expected: Medium severity issue, validity < 0.95

**Test 5: Mixed Quality**
- Some columns perfect, some problematic
- Expected: Moderate overall score, mixed severity issues

### 7.2 Edge Cases

- Empty dataset (0 rows) → Error before profiling
- Single row → Uniqueness metrics meaningless
- Single column → Reduced quality dimensions
- All nulls in a column → Completeness = 0 for that column

## 8. Performance Considerations

### 8.1 Query Optimization

**Problem:** Quality profiling runs many queries (one per column per metric)

**Mitigation:**
- Combine queries where possible (single query for multiple columns)
- Run in parallel (async/await pattern)
- Cache results (schema detection already computed distinct counts)

### 8.2 Estimated Runtime

| Dataset Size | Profiling Time | Bottleneck |
|--------------|----------------|------------|
| 10K rows | < 1s | Negligible |
| 100K rows | 2-5s | Outlier detection (quantile queries) |
| 1M rows | 10-30s | Duplicate detection (full scan) |

**Acceptable:** Most datasets < 100K rows, profiling completes in seconds.

## 9. Future Enhancements

### 9.1 Out of Scope (Phase 1-6)

- Custom quality rules (user-defined thresholds)
- Time-based quality drift tracking
- Cross-dataset quality comparison
- Automated data cleaning recommendations
- Machine learning-based anomaly detection

### 9.2 Potential Phase 7+ Features

- Suggested data cleaning actions ("Remove duplicates", "Impute missing values")
- Quality trend visualization (if datasets re-imported over time)
- Domain-specific validation rules (e.g., email format, phone numbers)

## 10. Document Status

- **Version:** 1.0  
- **Created:** 2026-09-08  
- **Covers:** Quality metrics, issue detection, profiling implementation  
- **Related Docs:** SYSTEM_SPECIFICATION.md, DATA_INGESTION.md, DATABASE_DESIGN.md
