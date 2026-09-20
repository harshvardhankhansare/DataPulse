# Insight Engine

## 1. Overview

The insight engine transforms analysis results into natural language statements with evidence linking. Every insight must be explainable, traceable to its source query, and verifiable by the user.

**Core Principle:** No unexplained "black box" claims. Every insight links back to SQL + source columns.

## 2. Design Philosophy

### 2.1 Why Evidence-Backed Insights?

**Academic Context (Project Viva):**
- User must explain how insights were generated
- Evaluators will ask: "How did you calculate this?"
- Evidence linking demonstrates rigor and transparency

**User Trust:**
- Users should understand where numbers come from
- "View Calculation" shows the actual SQL query
- No mystery algorithms or hidden logic

**Debugging:**
- If an insight seems wrong, trace back to source data
- Verify query logic, check for data quality issues

### 2.2 Insight vs. Analysis Result

**Analysis Result (raw data):**
```typescript
{
  column: 'revenue',
  mean: 45230.50,
  median: 42000,
  stddev: 12500
}
```

**Insight (interpreted):**
```typescript
{
  text: "Revenue has high variability (std dev = $12,500), indicating inconsistent sales performance",
  evidenceQuery: "SELECT AVG(revenue), STDDEV(revenue) FROM dataset",
  sourceColumns: ['revenue'],
  insightType: 'summary',
  confidence: 'high'
}
```

## 3. Insight Structure

### 3.1 Insight Interface

```typescript
interface Insight {
  id: string;
  text: string;                    // Natural language statement
  evidenceQuery: string;           // SQL query that produced this
  sourceColumns: string[];         // Referenced columns
  insightType: InsightType;
  confidence: 'high' | 'medium' | 'low';
  metadata?: {
    analysisType: AnalysisType;
    values?: Record<string, number>;  // Key numbers in the insight
  };
}

type InsightType = 
  | 'trend'           // Temporal change ("increased by X%")
  | 'comparison'      // Category comparison ("A is larger than B")
  | 'outlier'         // Unusual values ("X exceeds normal range")
  | 'summary';        // Overview ("Top N account for X%")
```

### 3.2 Confidence Levels

**High Confidence:**
- Based on complete data (< 5% missing values)
- Large sample size (> 100 rows)
- Clear statistical significance (strong correlation, obvious trend)

**Medium Confidence:**
- Some missing data (5-20% missing)
- Moderate sample size (30-100 rows)
- Moderate effect size

**Low Confidence:**
- Significant missing data (> 20%)
- Small sample size (< 30 rows)
- Weak patterns or marginal differences

## 4. Insight Templates

### 4.1 Trend Insights (Time Series)

**Pattern:** Temporal change in numeric values

**Template 1: Increase/Decrease**
```typescript
function generateTrendInsight(
  column: string,
  startValue: number,
  endValue: number,
  startPeriod: string,
  endPeriod: string
): Insight {
  const change = ((endValue - startValue) / startValue) * 100;
  const direction = change > 0 ? 'increased' : 'decreased';
  
  return {
    id: generateId(),
    text: `${column} ${direction} by ${Math.abs(change).toFixed(1)}% from ${startPeriod} to ${endPeriod}`,
    evidenceQuery: `
      SELECT 
        MIN(period) as start_period, 
        MAX(period) as end_period,
        FIRST(value) as start_value,
        LAST(value) as end_value
      FROM (
        SELECT DATE_TRUNC('month', date_col) as period, AVG(${column}) as value
        FROM dataset
        GROUP BY period
        ORDER BY period
      )
    `,
    sourceColumns: ['date_col', column],
    insightType: 'trend',
    confidence: 'high',
    metadata: {
      analysisType: 'time_series',
      values: { change, startValue, endValue }
    }
  };
}
```

**Example Output:**
- "Revenue increased by 23.5% from Jan 2024 to Dec 2024"
- "Customer count decreased by 12.3% from Q1 to Q4"

### 4.2 Comparison Insights (Group Aggregation)

**Pattern:** One category significantly different from others

**Template 1: Top Performer**
```typescript
function generateComparisonInsight(
  categoricalColumn: string,
  numericColumn: string,
  topCategory: string,
  topValue: number,
  secondCategory: string,
  secondValue: number
): Insight {
  const percentageMore = ((topValue - secondValue) / secondValue) * 100;
  
  return {
    id: generateId(),
    text: `${topCategory} has the highest ${numericColumn} (${formatValue(topValue)}), ${percentageMore.toFixed(1)}% more than ${secondCategory}`,
    evidenceQuery: `
      SELECT ${categoricalColumn}, AVG(${numericColumn}) as avg_value
      FROM dataset
      GROUP BY ${categoricalColumn}
      ORDER BY avg_value DESC
      LIMIT 2
    `,
    sourceColumns: [categoricalColumn, numericColumn],
    insightType: 'comparison',
    confidence: 'high',
    metadata: {
      analysisType: 'group_aggregation',
      values: { topValue, secondValue, percentageMore }
    }
  };
}
```

**Example Output:**
- "Electronics has the highest revenue ($125,450), 45.2% more than Clothing"
- "North region has the highest average order value ($89.50), 22.8% more than South"

**Template 2: Concentration**
```typescript
function generateConcentrationInsight(
  categoricalColumn: string,
  numericColumn: string,
  topN: number,
  topNTotal: number,
  grandTotal: number
): Insight {
  const percentage = (topNTotal / grandTotal) * 100;
  
  return {
    id: generateId(),
    text: `Top ${topN} ${categoricalColumn} account for ${percentage.toFixed(1)}% of total ${numericColumn}`,
    evidenceQuery: `
      WITH ranked AS (
        SELECT ${categoricalColumn}, SUM(${numericColumn}) as total
        FROM dataset
        GROUP BY ${categoricalColumn}
        ORDER BY total DESC
        LIMIT ${topN}
      )
      SELECT SUM(total) as top_n_total FROM ranked
      UNION ALL
      SELECT SUM(${numericColumn}) as grand_total FROM dataset
    `,
    sourceColumns: [categoricalColumn, numericColumn],
    insightType: 'summary',
    confidence: 'high',
    metadata: {
      analysisType: 'group_aggregation',
      values: { topN, percentage }
    }
  };
}
```

**Example Output:**
- "Top 5 products account for 78.3% of total revenue"
- "Top 3 regions account for 65.2% of total customers"

### 4.3 Outlier Insights (Descriptive Stats)

**Pattern:** Values beyond statistical norms

**Template 1: Statistical Outliers**
```typescript
function generateOutlierInsight(
  column: string,
  outlierCount: number,
  totalCount: number,
  threshold: number
): Insight {
  const percentage = (outlierCount / totalCount) * 100;
  
  return {
    id: generateId(),
    text: `${column} has ${outlierCount} values (${percentage.toFixed(1)}%) beyond ${threshold} standard deviations from the mean`,
    evidenceQuery: `
      WITH stats AS (
        SELECT AVG(${column}) as mean, STDDEV(${column}) as stddev
        FROM dataset
      )
      SELECT COUNT(*) as outlier_count
      FROM dataset, stats
      WHERE ABS(${column} - mean) > ${threshold} * stddev
    `,
    sourceColumns: [column],
    insightType: 'outlier',
    confidence: 'medium',
    metadata: {
      analysisType: 'descriptive_stats',
      values: { outlierCount, percentage, threshold }
    }
  };
}
```

**Example Output:**
- "Age has 8 values (2.3%) beyond 3 standard deviations from the mean"
- "Transaction amount has 45 values (5.1%) beyond 2 standard deviations from the mean"

### 4.4 Summary Insights (Descriptive Stats)

**Pattern:** Overall data characteristics

**Template 1: Variability**
```typescript
function generateVariabilityInsight(
  column: string,
  mean: number,
  stddev: number
): Insight {
  const coefficientOfVariation = (stddev / mean) * 100;
  const variability = coefficientOfVariation > 50 ? 'high' :
                      coefficientOfVariation > 25 ? 'moderate' : 'low';
  
  return {
    id: generateId(),
    text: `${column} has ${variability} variability (coefficient of variation = ${coefficientOfVariation.toFixed(1)}%)`,
    evidenceQuery: `
      SELECT 
        AVG(${column}) as mean,
        STDDEV(${column}) as stddev,
        (STDDEV(${column}) / AVG(${column}) * 100) as cv
      FROM dataset
    `,
    sourceColumns: [column],
    insightType: 'summary',
    confidence: 'high',
    metadata: {
      analysisType: 'descriptive_stats',
      values: { mean, stddev, coefficientOfVariation }
    }
  };
}
```

**Example Output:**
- "Revenue has high variability (coefficient of variation = 67.3%)"
- "Age has low variability (coefficient of variation = 15.2%)"

### 4.5 Correlation Insights

**Pattern:** Relationship strength between variables

**Template 1: Strong Correlation**
```typescript
function generateCorrelationInsight(
  col1: string,
  col2: string,
  correlation: number
): Insight {
  const strength = Math.abs(correlation) > 0.7 ? 'strong' :
                   Math.abs(correlation) > 0.4 ? 'moderate' : 'weak';
  const direction = correlation > 0 ? 'positive' : 'negative';
  
  return {
    id: generateId(),
    text: `${col1} and ${col2} have a ${strength} ${direction} correlation (r = ${correlation.toFixed(2)})`,
    evidenceQuery: `
      SELECT CORR(${col1}, ${col2}) as correlation
      FROM dataset
    `,
    sourceColumns: [col1, col2],
    insightType: 'summary',
    confidence: 'high',
    metadata: {
      analysisType: 'correlation',
      values: { correlation }
    }
  };
}
```

**Example Output:**
- "Price and quantity have a strong negative correlation (r = -0.82)"
- "Age and income have a moderate positive correlation (r = 0.54)"

## 5. Insight Generation Logic

### 5.1 Generator Function

```typescript
// src/core/insights/insightGenerator.ts
export async function generateInsights(
  db: Database,
  schema: Schema,
  analysisResults: AnalysisResult[]
): Promise<Insight[]> {
  const insights: Insight[] = [];
  
  for (const result of analysisResults) {
    switch (result.analysisType) {
      case 'descriptive_stats':
        insights.push(...generateDescriptiveInsights(result.data));
        break;
      case 'group_aggregation':
        insights.push(...generateAggregationInsights(result.data, result.params));
        break;
      case 'correlation':
        insights.push(...generateCorrelationInsights(result.data));
        break;
      case 'time_series':
        insights.push(...generateTimeSeriesInsights(result.data, result.params));
        break;
    }
  }
  
  // Rank by confidence and importance
  return insights.sort((a, b) => {
    const confidenceOrder = { high: 3, medium: 2, low: 1 };
    return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
  });
}
```

### 5.2 Filtering Insignificant Insights

**Thresholds:**
- Time series: Only report if change > 5% (ignore minor fluctuations)
- Comparison: Only report if difference > 10% (ignore marginal differences)
- Correlation: Only report if |r| > 0.3 (ignore weak correlations)
- Outliers: Only report if > 5 outliers (ignore isolated anomalies)

```typescript
function isSignificantTrend(change: number): boolean {
  return Math.abs(change) > 5;  // > 5% change
}

function isSignificantDifference(topValue: number, secondValue: number): boolean {
  return ((topValue - secondValue) / secondValue) > 0.1;  // > 10% difference
}
```

## 6. UI Integration

### 6.1 Insight Display Component

```tsx
// src/renderer/components/InsightList.tsx
interface InsightListProps {
  insights: Insight[];
}

export function InsightList({ insights }: InsightListProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Key Insights</h2>
      {insights.map(insight => (
        <InsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const [showEvidence, setShowEvidence] = useState(false);
  
  const confidenceColor = {
    high: 'text-green-600',
    medium: 'text-yellow-600',
    low: 'text-gray-600'
  }[insight.confidence];
  
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <InsightTypeIcon type={insight.insightType} />
          <p className="text-lg">{insight.text}</p>
          <p className={`text-sm mt-2 ${confidenceColor}`}>
            Confidence: {insight.confidence}
          </p>
        </div>
        
        <button
          onClick={() => setShowEvidence(!showEvidence)}
          className="text-blue-600 text-sm hover:underline"
        >
          {showEvidence ? 'Hide' : 'View'} Calculation
        </button>
      </div>
      
      {showEvidence && (
        <div className="mt-4 p-3 bg-gray-50 rounded">
          <p className="text-xs font-semibold mb-2">Evidence Query:</p>
          <pre className="text-xs overflow-x-auto">
            {insight.evidenceQuery}
          </pre>
          <p className="text-xs mt-2">
            Source columns: {insight.sourceColumns.join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}
```

### 6.2 Insight Filtering

**Phase 6 Enhancement:**
```tsx
const [filterType, setFilterType] = useState<InsightType | 'all'>('all');
const [filterConfidence, setFilterConfidence] = useState<'all' | 'high'>('all');

const filteredInsights = insights.filter(insight => {
  if (filterType !== 'all' && insight.insightType !== filterType) return false;
  if (filterConfidence !== 'all' && insight.confidence !== filterConfidence) return false;
  return true;
});
```

## 7. Value Formatting

### 7.1 Formatting Utilities

```typescript
function formatValue(value: number, column?: string): string {
  // Currency columns
  if (column && /revenue|price|cost|salary/i.test(column)) {
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  
  // Percentage columns
  if (column && /percent|rate|ratio/i.test(column)) {
    return `${(value * 100).toFixed(1)}%`;
  }
  
  // Large numbers
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  
  // Default: up to 2 decimal places
  return value.toFixed(2);
}
```

## 8. Testing Strategy

### 8.1 Template Tests

**Test each template with mock data:**
```typescript
test('generateTrendInsight formats increase correctly', () => {
  const insight = generateTrendInsight(
    'revenue',
    100000,
    125000,
    '2024-01',
    '2024-12'
  );
  
  expect(insight.text).toContain('increased by 25.0%');
  expect(insight.text).toContain('2024-01 to 2024-12');
  expect(insight.confidence).toBe('high');
});
```

### 8.2 Integration Tests

**Test with real analysis results:**
- Run analytics on test datasets
- Verify insights generated
- Check evidence queries are valid SQL
- Confirm source columns match

## 9. Limitations

### 9.1 Current Scope (Phase 1-6)

**Supported:**
- Template-based generation (predefined patterns)
- Statistical insights (means, trends, correlations)
- Evidence linking (SQL queries)

**NOT Supported:**
- Natural language generation (GPT-style text)
- Causal inference ("X causes Y")
- External knowledge ("Industry average is...")
- Comparative insights across multiple datasets
- Predictive insights ("will increase next month")

### 9.2 Phase 7 (Optional AI Enhancement)

**If local LLM available:**
- Use LLM to rephrase template text (more natural language)
- Generate context-aware descriptions
- Still require evidence linking (LLM doesn't replace SQL)

## 10. Future Enhancements

### 10.1 Advanced Insight Types (Phase 7+)

- **Seasonality detection:** "Revenue peaks in Q4 each year"
- **Anomaly detection:** "Jan 2024 is unusually low compared to historical pattern"
- **Interaction effects:** "Price discount has stronger effect in Region A than Region B"
- **Pareto analysis:** "20% of customers generate 80% of revenue"

### 10.2 User Interaction

- Bookmark/favorite insights
- Export insights to report
- Ask follow-up questions ("Why did this happen?")
- Drill down into evidence (show raw data rows)

## 11. Document Status

- **Version:** 1.0  
- **Created:** 2026-09-08  
- **Covers:** Insight structure, templates, generation logic, evidence linking, UI integration  
- **Related Docs:** ANALYTICS_ENGINE.md, VISUALIZATION_ENGINE.md, SYSTEM_SPECIFICATION.md
