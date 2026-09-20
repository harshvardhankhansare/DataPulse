# Analytics Engine

## 1. Overview

The analytics engine executes data analysis queries based on the rule engine's recommendations. It provides four core analysis types, each implemented as a standalone DuckDB query function.

## 2. Architecture Principles

**Core Design:**
- One analysis type = one TypeScript function
- Pure functions: typed inputs → typed outputs
- No business logic beyond SQL query construction
- Parameterized queries (no SQL injection)
- Results are raw data arrays (interpretation happens in insight generator)

**Module Location:** `src/core/analytics/`

## 3. Analysis Types

### 3.1 Descriptive Statistics

**Purpose:** Summarize numeric column distributions

**Applicable When:** Schema has at least one NUMERIC column

**Function Signature:**
```typescript
interface DescriptiveStatsParams {
  numericColumns: string[];
}

interface DescriptiveStatsResult {
  column: string;
  count: number;
  nullCount: number;
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
}

async function computeDescriptiveStats(
  db: Database,
  tableName: string,
  params: DescriptiveStatsParams
): Promise<DescriptiveStatsResult[]>
```

**SQL Implementation:**
```sql
SELECT 
  '${column}' as column,
  COUNT(*) as count,
  COUNT(*) - COUNT("${column}") as null_count,
  AVG("${column}") as mean,
  MEDIAN("${column}") as median,
  STDDEV("${column}") as stddev,
  MIN("${column}") as min,
  MAX("${column}") as max,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY "${column}") as q1,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "${column}") as q3
FROM ${tableName}
```

**Output Interpretation:**
- Mean vs. median: detect skew
- Stddev: measure of spread
- Q1, Q3: quartile boundaries for boxplot
- Min, max: range

### 3.2 Group Aggregation

**Purpose:** Aggregate numeric values by categories

**Applicable When:** Schema has at least one CATEGORICAL column AND one NUMERIC column

**Function Signature:**
```typescript
interface GroupAggregationParams {
  categoricalColumn: string;
  numericColumn: string;
  aggregation: 'avg' | 'sum' | 'count' | 'min' | 'max';
  topN?: number;  // Limit to top N categories (default 20)
}

interface GroupAggregationResult {
  category: string;
  value: number;
}

async function computeGroupAggregation(
  db: Database,
  tableName: string,
  params: GroupAggregationParams
): Promise<GroupAggregationResult[]>
```

**SQL Implementation:**
```sql
SELECT 
  "${params.categoricalColumn}" as category,
  ${aggregationFunction}("${params.numericColumn}") as value
FROM ${tableName}
GROUP BY "${params.categoricalColumn}"
ORDER BY value DESC
LIMIT ${params.topN ?? 20}
```

**Aggregation Functions:**
- `avg`: Mean value per category
- `sum`: Total per category
- `count`: Row count per category
- `min`: Minimum value per category
- `max`: Maximum value per category

**Top-N Limiting:**
- Prevents unreadable charts with 100+ categories
- Default limit: 20 categories
- Sorted by aggregated value (descending)

### 3.3 Correlation Analysis

**Purpose:** Measure linear relationships between numeric columns

**Applicable When:** Schema has at least 2 NUMERIC columns

**Function Signature:**
```typescript
interface CorrelationParams {
  numericColumns: string[];  // Minimum 2 columns
}

interface CorrelationResult {
  column1: string;
  column2: string;
  correlation: number;  // Pearson correlation coefficient (-1 to 1)
}

async function computeCorrelation(
  db: Database,
  tableName: string,
  params: CorrelationParams
): Promise<CorrelationResult[]>
```

**SQL Implementation:**
```sql
-- For each pair of numeric columns
SELECT 
  '${col1}' as column1,
  '${col2}' as column2,
  CORR("${col1}", "${col2}") as correlation
FROM ${tableName}
WHERE "${col1}" IS NOT NULL AND "${col2}" IS NOT NULL
```

**Correlation Interpretation:**
- +1: Perfect positive correlation
- 0: No linear correlation
- -1: Perfect negative correlation
- |r| > 0.7: Strong correlation
- |r| 0.3-0.7: Moderate correlation
- |r| < 0.3: Weak correlation

**Pairwise Combinations:**
- For N columns, compute N*(N-1)/2 pairs
- Example: 5 columns → 10 correlation coefficients
- Limit: If N > 10 columns, restrict to most relevant pairs (Phase 6 enhancement)

### 3.4 Time Series Trends

**Purpose:** Analyze temporal patterns in numeric data

**Applicable When:** Schema has at least one DATE/DATETIME column AND one NUMERIC column

**Function Signature:**
```typescript
interface TimeSeriesParams {
  dateColumn: string;
  numericColumn: string;
  aggregation: 'avg' | 'sum' | 'count';
  granularity: 'day' | 'week' | 'month' | 'quarter' | 'year';
}

interface TimeSeriesResult {
  period: string;  // ISO date string
  value: number;
}

async function computeTimeSeries(
  db: Database,
  tableName: string,
  params: TimeSeriesParams
): Promise<TimeSeriesResult[]>
```

**SQL Implementation:**
```sql
SELECT 
  DATE_TRUNC('${params.granularity}', "${params.dateColumn}") as period,
  ${aggregationFunction}("${params.numericColumn}") as value
FROM ${tableName}
WHERE "${params.dateColumn}" IS NOT NULL
GROUP BY DATE_TRUNC('${params.granularity}', "${params.dateColumn}")
ORDER BY period ASC
```

**Granularity Selection:**
- Auto-selected based on date range:
  - < 30 days → daily
  - 30-365 days → weekly or monthly
  - > 365 days → monthly or yearly

**Trend Detection (Insight Generation):**
- Calculate period-over-period change: `(current - previous) / previous * 100`
- Identify increasing/decreasing trends
- Detect seasonality (future enhancement)

## 4. Rule Engine Integration

### 4.1 How Rules Select Analyses

**Rule Definition Example (`src/core/rules/ruleDefinitions.ts`):**
```typescript
{
  id: 'group_aggregation_categorical_numeric',
  analysisType: 'group_aggregation',
  condition: (schema: Schema) => 
    schema.columns.some(col => col.detectedType === 'CATEGORICAL') &&
    schema.columns.some(col => col.detectedType === 'NUMERIC'),
  priority: 2,
  parameterGenerator: (schema: Schema) => ({
    categoricalColumn: schema.columns.find(c => c.detectedType === 'CATEGORICAL').name,
    numericColumn: schema.columns.find(c => c.detectedType === 'NUMERIC').name,
    aggregation: 'avg',
    topN: 20
  })
}
```

**Rule Engine Output:**
```typescript
const applicableAnalyses = selectApplicableAnalyses(schema);
// Returns: AnalysisTask[]

interface AnalysisTask {
  analysisType: AnalysisType;
  parameters: AnalysisParameters;
}
```

**Execution Loop:**
```typescript
const results: AnalysisResult[] = [];

for (const task of applicableAnalyses) {
  switch (task.analysisType) {
    case 'descriptive_stats':
      results.push(await computeDescriptiveStats(db, tableName, task.parameters));
      break;
    case 'group_aggregation':
      results.push(await computeGroupAggregation(db, tableName, task.parameters));
      break;
    case 'correlation':
      results.push(await computeCorrelation(db, tableName, task.parameters));
      break;
    case 'time_series':
      results.push(await computeTimeSeries(db, tableName, task.parameters));
      break;
  }
}
```

## 5. Query Safety

### 5.1 SQL Injection Prevention

**Problem:** Column names come from schema detection (user-controlled file headers)

**Solution:**
1. **Validate column names against schema:**
```typescript
function validateColumnName(columnName: string, schema: Schema): void {
  const validColumns = schema.columns.map(c => c.name);
  if (!validColumns.includes(columnName)) {
    throw new Error(`Invalid column name: ${columnName}`);
  }
}
```

2. **Use double-quoted identifiers:**
```typescript
// Protects against column names with spaces or special chars
const sql = `SELECT "${columnName}" FROM ${tableName}`;
```

3. **Sanitize table names:**
```typescript
// Only allow dataset table (no user-provided table names)
const TABLE_NAME = 'dataset';  // Constant, never user input
```

### 5.2 Query Timeout Handling

**Future Enhancement (Phase 6):**
```typescript
db.exec('SET statement_timeout = 30000');  // 30 seconds

try {
  const result = await executeQuery(sql);
} catch (error) {
  if (error.message.includes('timeout')) {
    throw new Error('Analysis took too long. Dataset may be too large.');
  }
  throw error;
}
```

## 6. Error Handling

### 6.1 Common Errors

**Empty Result Sets:**
- Cause: All values NULL in selected columns
- Handling: Return empty array, skip chart generation

**Type Mismatches:**
- Cause: Schema detection incorrect (TEXT column marked as NUMERIC)
- Handling: DuckDB will error on AVG(text_col), catch and skip analysis

**Memory Errors:**
- Cause: Dataset too large for in-memory aggregation
- Handling: Show user-friendly error, suggest data sampling

### 6.2 Error Response Format

```typescript
interface AnalysisError {
  analysisType: AnalysisType;
  error: string;
  skipped: boolean;  // True if analysis was skipped (non-fatal)
}
```

## 7. Performance Optimization

### 7.1 Query Patterns

**Efficient:**
- Column projection (only select needed columns)
- Single-pass aggregations
- Indexed access (DuckDB auto-indexes)

**Inefficient (avoid):**
- SELECT * (loads all columns into memory)
- Multiple passes over same data
- Cartesian products

### 7.2 Parallelization

**Future Enhancement:**
- Run independent analyses concurrently
- Use DuckDB's parallel query execution
- Current: Sequential execution (simpler, acceptable performance)

## 8. Testing Strategy

### 8.1 Unit Tests

**Test each analysis function with:**
1. Valid inputs → expected output structure
2. Edge cases: single row, all nulls, extreme values
3. Invalid inputs → appropriate errors

**Example Test (descriptive stats):**
```typescript
test('computeDescriptiveStats returns correct structure', async () => {
  const result = await computeDescriptiveStats(db, 'dataset', {
    numericColumns: ['age', 'salary']
  });
  
  expect(result).toHaveLength(2);
  expect(result[0]).toHaveProperty('column', 'age');
  expect(result[0]).toHaveProperty('mean');
  expect(result[0].mean).toBeGreaterThan(0);
});
```

### 8.2 Integration Tests

**Test with real datasets:**
- students.csv → descriptive stats on age/grade
- sales.csv → group aggregation (region + revenue)
- messy.csv → handle nulls gracefully

## 9. Extensibility

### 9.1 Adding New Analysis Types

**Steps to add a new analysis:**
1. Create `src/core/analytics/newAnalysis.ts`
2. Define params and result interfaces
3. Implement query function
4. Add rule to `ruleDefinitions.ts`
5. Update `AnalysisType` union type
6. Add case to execution switch statement

**Example: Adding "Distribution Analysis" (histogram):**
```typescript
// src/core/analytics/distribution.ts
interface DistributionParams {
  numericColumn: string;
  binCount?: number;  // Default 10
}

interface DistributionResult {
  binStart: number;
  binEnd: number;
  count: number;
}

async function computeDistribution(
  db: Database,
  tableName: string,
  params: DistributionParams
): Promise<DistributionResult[]> {
  const binCount = params.binCount ?? 10;
  
  const sql = `
    WITH bounds AS (
      SELECT MIN("${params.numericColumn}") as min_val,
             MAX("${params.numericColumn}") as max_val
      FROM ${tableName}
    ),
    bins AS (
      SELECT 
        generate_series(0, ${binCount - 1}) as bin_idx,
        min_val + (max_val - min_val) * generate_series(0, ${binCount - 1}) / ${binCount} as bin_start,
        min_val + (max_val - min_val) * generate_series(1, ${binCount}) / ${binCount} as bin_end
      FROM bounds
    )
    SELECT 
      bins.bin_start,
      bins.bin_end,
      COUNT(*) as count
    FROM ${tableName}, bins
    WHERE "${params.numericColumn}" >= bins.bin_start 
      AND "${params.numericColumn}" < bins.bin_end
    GROUP BY bins.bin_idx, bins.bin_start, bins.bin_end
    ORDER BY bins.bin_idx
  `;
  
  return await db.prepare(sql).all();
}
```

## 10. Future Enhancements (Out of Scope)

### 10.1 Advanced Analytics (Phase 7+)

- **Regression analysis:** Linear/polynomial regression
- **Forecasting:** Time series prediction
- **Clustering:** K-means, DBSCAN
- **Classification:** Decision trees
- **Anomaly detection:** Isolation forest

### 10.2 Performance Features

- Query result caching (avoid re-running same analysis)
- Incremental computation (update results when data changes)
- Approximate queries (sampling for large datasets)

## 11. Document Status

- **Version:** 1.0  
- **Created:** 2026-09-08  
- **Covers:** Four core analysis types, implementation patterns, rule integration  
- **Related Docs:** SYSTEM_SPECIFICATION.md, DATABASE_DESIGN.md, INSIGHT_ENGINE.md
