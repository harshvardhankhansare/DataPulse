# Visualization Engine

## 1. Overview

The visualization engine maps analysis results to chart configurations and renders them using ECharts. It applies guard rules to ensure readable, meaningful visualizations.

**Core Responsibility:** Analysis result data → ECharts option object

**Module Location:** `src/core/charts/chartSelector.ts`

## 2. Chart Type Mapping

### 2.1 Analysis Type → Chart Type

| Analysis Type | Result Shape | Default Chart | Alternative |
|---------------|--------------|---------------|-------------|
| `descriptive_stats` | Column + statistics | Horizontal bar (compare means) | Table |
| `group_aggregation` | Category + value | Vertical bar | Table (if > 20 categories) |
| `correlation` | Column pairs + coefficient | Heatmap | Scatter matrix |
| `time_series` | Date + value | Line chart | Area chart |

### 2.2 Chart Selection Logic

```typescript
function mapToChartConfig(
  analysisType: AnalysisType,
  result: any[],
  params: AnalysisParameters
): ChartConfig {
  switch (analysisType) {
    case 'descriptive_stats':
      return createBarChart(result, 'Descriptive Statistics');
    
    case 'group_aggregation':
      if (result.length > 20) {
        return createTableView(result);  // Too many categories for bar chart
      }
      return createBarChart(result, `${params.aggregation} by ${params.categoricalColumn}`);
    
    case 'correlation':
      if (result.length > 50) {
        return createTableView(result);  // Too many pairs for heatmap
      }
      return createHeatmap(result, 'Correlation Matrix');
    
    case 'time_series':
      return createLineChart(result, `${params.numericColumn} over time`);
    
    default:
      throw new Error(`Unknown analysis type: ${analysisType}`);
  }
}
```

## 3. Chart Implementations

### 3.1 Bar Chart

**Use Cases:**
- Descriptive statistics (compare mean values across columns)
- Group aggregation (category counts/sums/averages)

**ECharts Configuration:**
```typescript
function createBarChart(data: any[], title: string): ChartConfig {
  // Extract categories and values
  const categories = data.map(item => item.category || item.column);
  const values = data.map(item => item.value || item.mean);
  
  return {
    id: generateId(),
    title,
    type: 'bar',
    sourceAnalysis: analysisType,
    sourceColumns: [categoryColumn, numericColumn],
    echartsOption: {
      title: { text: title, left: 'center' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' }
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: {
          rotate: 45,  // Rotate labels if long
          interval: 0  // Show all labels
        }
      },
      yAxis: { type: 'value' },
      series: [{
        type: 'bar',
        data: values,
        itemStyle: {
          color: '#5470c6'  // Default blue
        }
      }]
    }
  };
}
```

**Guard Rules:**
- Maximum 20 categories (truncate to top-N or switch to table)
- Rotate labels if category names > 10 characters
- Show values on bars if < 10 categories

### 3.2 Line Chart

**Use Cases:**
- Time series trends
- Sequential data

**ECharts Configuration:**
```typescript
function createLineChart(data: TimeSeriesResult[], title: string): ChartConfig {
  const dates = data.map(item => item.period);
  const values = data.map(item => item.value);
  
  return {
    id: generateId(),
    title,
    type: 'line',
    sourceAnalysis: 'time_series',
    sourceColumns: [dateColumn, numericColumn],
    echartsOption: {
      title: { text: title, left: 'center' },
      tooltip: {
        trigger: 'axis',
        formatter: '{b}<br/>{a}: {c}'
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false
      },
      yAxis: { type: 'value' },
      series: [{
        type: 'line',
        data: values,
        smooth: true,  // Smooth curve
        areaStyle: {   // Fill area under line
          opacity: 0.3
        },
        itemStyle: {
          color: '#91cc75'
        }
      }]
    }
  };
}
```

**Guard Rules:**
- Minimum 2 data points (can't draw line with 1 point)
- Maximum 1000 points (sample if more)
- Sort by date (ensure chronological order)

### 3.3 Scatter Plot

**Use Cases:**
- Correlation visualization (two numeric columns)
- Outlier identification

**ECharts Configuration:**
```typescript
function createScatterPlot(
  data: any[],
  xColumn: string,
  yColumn: string,
  title: string
): ChartConfig {
  const points = data.map(item => [item[xColumn], item[yColumn]]);
  
  return {
    id: generateId(),
    title,
    type: 'scatter',
    sourceAnalysis: 'correlation',
    sourceColumns: [xColumn, yColumn],
    echartsOption: {
      title: { text: title, left: 'center' },
      tooltip: {
        trigger: 'item',
        formatter: `${xColumn}: {c[0]}<br/>${yColumn}: {c[1]}`
      },
      xAxis: { 
        type: 'value',
        name: xColumn,
        nameLocation: 'middle',
        nameGap: 30
      },
      yAxis: { 
        type: 'value',
        name: yColumn,
        nameLocation: 'middle',
        nameGap: 40
      },
      series: [{
        type: 'scatter',
        data: points,
        itemStyle: {
          color: '#fac858'
        }
      }]
    }
  };
}
```

**Guard Rules:**
- Maximum 10,000 points (sample if more to avoid rendering lag)
- Warn if correlation coefficient < 0.1 (weak correlation, scatter plot may not be informative)

### 3.4 Heatmap (Correlation Matrix)

**Use Cases:**
- Visualize correlation between multiple numeric columns
- Identify strongly correlated pairs

**ECharts Configuration:**
```typescript
function createHeatmap(data: CorrelationResult[], title: string): ChartConfig {
  // Extract unique column names
  const columns = Array.from(new Set(
    data.flatMap(item => [item.column1, item.column2])
  ));
  
  // Build matrix data: [x, y, correlation]
  const matrixData = data.map(item => {
    const x = columns.indexOf(item.column1);
    const y = columns.indexOf(item.column2);
    return [x, y, item.correlation];
  });
  
  return {
    id: generateId(),
    title,
    type: 'heatmap',
    sourceAnalysis: 'correlation',
    sourceColumns: columns,
    echartsOption: {
      title: { text: title, left: 'center' },
      tooltip: {
        formatter: (params: any) => {
          const col1 = columns[params.data[0]];
          const col2 = columns[params.data[1]];
          const corr = params.data[2].toFixed(2);
          return `${col1} vs ${col2}<br/>Correlation: ${corr}`;
        }
      },
      xAxis: {
        type: 'category',
        data: columns,
        axisLabel: { rotate: 45 }
      },
      yAxis: {
        type: 'category',
        data: columns
      },
      visualMap: {
        min: -1,
        max: 1,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '5%',
        inRange: {
          color: ['#313695', '#4575b4', '#ffffbf', '#d73027', '#a50026']
        }
      },
      series: [{
        type: 'heatmap',
        data: matrixData,
        label: {
          show: true,
          formatter: (params: any) => params.data[2].toFixed(2)
        }
      }]
    }
  };
}
```

**Guard Rules:**
- Maximum 10x10 matrix (limit to 10 columns)
- Show correlation values in cells if matrix < 7x7
- Use diverging color scale (negative → white → positive)

## 4. Guard Rules

### 4.1 Categorical Overload

**Problem:** Bar chart with 100 categories is unreadable

**Solution:**
- Limit to top 20 categories (sorted by value)
- Fall back to table view if > 20 after limiting
- Add note: "Showing top 20 of N categories"

```typescript
if (categories.length > 20) {
  data = data
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);
  
  chartConfig.subtitle = `Showing top 20 of ${categories.length} categories`;
}
```

### 4.2 No Pie Charts

**Rationale:**
- Hard to compare slice sizes visually
- Poor for > 5 categories
- Angle perception less accurate than length (bar charts)

**Alternative:** Always use bar chart for categorical data

### 4.3 Data Point Limits

**Problem:** Rendering 1M points in scatter plot freezes browser

**Solution:**
- Sample data if > 10,000 points
- Use statistical sampling (not just first N rows)

```typescript
function sampleData(data: any[], maxPoints: number): any[] {
  if (data.length <= maxPoints) {
    return data;
  }
  
  const samplingRatio = maxPoints / data.length;
  return data.filter(() => Math.random() < samplingRatio);
}
```

### 4.4 Minimum Data Requirements

**Checks before rendering:**
- Bar chart: at least 1 category
- Line chart: at least 2 points
- Scatter plot: at least 5 points
- Heatmap: at least 2x2 matrix

**Fallback:** Show "Insufficient data for chart" message + raw data table

## 5. UI Integration

### 5.1 Chart Grid Component

**React Component (`src/renderer/components/ChartGrid.tsx`):**
```tsx
import ReactECharts from 'echarts-for-react';

interface ChartGridProps {
  charts: ChartConfig[];
}

export function ChartGrid({ charts }: ChartGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {charts.map(chart => (
        <div key={chart.id} className="bg-white rounded-lg shadow p-4">
          <ReactECharts 
            option={chart.echartsOption} 
            style={{ height: '400px' }}
            opts={{ renderer: 'canvas' }}
          />
          <ChartMetadata chart={chart} />
        </div>
      ))}
    </div>
  );
}

function ChartMetadata({ chart }: { chart: ChartConfig }) {
  return (
    <div className="mt-2 text-sm text-gray-600">
      <p>Source: {chart.sourceAnalysis}</p>
      <p>Columns: {chart.sourceColumns.join(', ')}</p>
    </div>
  );
}
```

### 5.2 Chart Interactivity

**ECharts Built-in Features:**
- Zoom: Mouse wheel or pinch
- Pan: Click and drag
- Tooltip: Hover over data points
- Legend toggle: Click legend items to show/hide series
- Data zoom: Slider for large time series

**Custom Actions (Phase 6):**
- Export chart as PNG (ECharts API)
- View underlying data table
- Adjust chart type (switch between bar/line for time series)

## 6. Responsive Design

### 6.1 Chart Sizing

**Grid Layout:**
- Desktop (> 1024px): 2 columns
- Tablet (768-1024px): 1 column
- Mobile (< 768px): 1 column, reduced height

**Chart Dimensions:**
```typescript
const chartStyle = {
  height: isMobile ? '300px' : '400px',
  width: '100%'
};
```

### 6.2 Label Rotation

**Automatic rotation for long labels:**
```typescript
xAxis: {
  axisLabel: {
    rotate: categories.some(cat => cat.length > 10) ? 45 : 0,
    interval: 0  // Show all labels
  }
}
```

## 7. Accessibility

### 7.1 Alternative Data Views

**Always provide table fallback:**
- User can toggle between chart and table view
- Screen readers can access table data
- Keyboard navigation for table cells

**Implementation:**
```tsx
const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

return (
  <div>
    <button onClick={() => setViewMode(mode => mode === 'chart' ? 'table' : 'chart')}>
      {viewMode === 'chart' ? 'View as Table' : 'View as Chart'}
    </button>
    
    {viewMode === 'chart' ? (
      <ReactECharts option={chart.echartsOption} />
    ) : (
      <DataTable data={chart.data} />
    )}
  </div>
);
```

### 7.2 Color Accessibility

**Use colorblind-friendly palettes:**
- Avoid red/green combinations alone
- Add patterns or labels in addition to color
- Provide high contrast mode option (Phase 6)

## 8. Performance Optimization

### 8.1 Lazy Rendering

**Render charts on scroll (Phase 6):**
```tsx
import { useInView } from 'react-intersection-observer';

function ChartCard({ chart }: { chart: ChartConfig }) {
  const { ref, inView } = useInView({ triggerOnce: true });
  
  return (
    <div ref={ref}>
      {inView ? (
        <ReactECharts option={chart.echartsOption} />
      ) : (
        <div className="h-96 bg-gray-100 animate-pulse" />
      )}
    </div>
  );
}
```

### 8.2 Canvas vs. SVG Rendering

**ECharts supports both:**
- **Canvas:** Faster for large datasets (> 1000 points), lower memory
- **SVG:** Better for small datasets, supports better interactivity

**Our choice:** Canvas (default) for performance

## 9. Testing Strategy

### 9.1 Visual Regression Tests

**Phase 6 Enhancement:**
- Screenshot charts in different states
- Compare against baseline images
- Detect unintended visual changes

### 9.2 Unit Tests

**Test chart config generation:**
```typescript
test('createBarChart generates valid ECharts option', () => {
  const data = [
    { category: 'A', value: 10 },
    { category: 'B', value: 20 }
  ];
  
  const config = createBarChart(data, 'Test Chart');
  
  expect(config.echartsOption.xAxis.data).toEqual(['A', 'B']);
  expect(config.echartsOption.series[0].data).toEqual([10, 20]);
});
```

## 10. Future Enhancements

### 10.1 Additional Chart Types (Phase 7+)

- Histogram (distribution analysis)
- Box plot (quartile visualization)
- Radar chart (multi-dimensional comparison)
- Sankey diagram (flow visualization)
- Tree map (hierarchical data)

### 10.2 Chart Customization

- User-selectable color schemes
- Font size adjustments
- Custom chart titles/labels
- Export settings (resolution, format)

## 11. Document Status

- **Version:** 1.0  
- **Created:** 2026-09-08  
- **Covers:** Chart type mapping, ECharts configurations, guard rules, UI integration  
- **Related Docs:** ANALYTICS_ENGINE.md, SYSTEM_SPECIFICATION.md
