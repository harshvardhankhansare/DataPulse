import test from 'node:test';
import assert from 'node:assert';
import { groupAggregationToChart, groupAggregationToCharts } from '../dist/core/charts/chartSelector.js';
import { correlationToChart, correlationToCharts } from '../dist/core/charts/chartSelector.js';
import { timeSeriesToChart, timeSeriesToCharts } from '../dist/core/charts/chartSelector.js';
import { descriptiveStatsToChart } from '../dist/core/charts/chartSelector.js';

test('chartSelector - groupAggregationToChart with sum', () => {
    const result = {
        mode: 'sum',
        categoryColumn: 'product',
        numericColumn: 'amount',
        rows: [
            { category: 'A', avg_value: 100, sum_value: 500 },
            { category: 'B', avg_value: 150, sum_value: 300 }
        ]
    };

    const chart = groupAggregationToChart(result);
    assert.strictEqual(chart.chartType, 'bar');
    assert.strictEqual(chart.title, 'Avg amount by product');
    assert.strictEqual(chart.xAxisLabel, 'product');
    assert.strictEqual(chart.yAxisLabel, 'Avg amount');
    assert.strictEqual(chart.data.length, 2);
    assert.strictEqual(chart.data[0].label, 'A');
    assert.strictEqual(chart.data[0].value, 100);
    assert.strictEqual(chart.data[0].value2, 500);
    assert.strictEqual(chart.analysisType, 'group_aggregation');
    assert.deepStrictEqual(chart.sourceColumns, ['product', 'amount']);
});

test('chartSelector - groupAggregationToChart with count', () => {
    const result = {
        mode: 'count',
        categoryColumn: 'status',
        numericColumn: 'id',
        rows: [
            { category: 'active', avg_value: 0, sum_value: 15 },
            { category: 'inactive', avg_value: 0, sum_value: 5 }
        ]
    };

    const chart = groupAggregationToChart(result);
    assert.strictEqual(chart.chartType, 'bar');
    assert.strictEqual(chart.title, 'status Distribution');
    assert.strictEqual(chart.xAxisLabel, 'status');
    assert.strictEqual(chart.yAxisLabel, 'Count');
    assert.strictEqual(chart.data.length, 2);
    assert.strictEqual(chart.data[0].label, 'active');
    assert.strictEqual(chart.data[0].value, 0);
    assert.strictEqual(chart.data[0].value2, 15);
    assert.strictEqual(chart.analysisType, 'group_aggregation');
    assert.deepStrictEqual(chart.sourceColumns, ['status', 'id']);
});

test('chartSelector - groupAggregationToCharts', () => {
    const results = [
        {
            mode: 'sum',
            categoryColumn: 'product',
            numericColumn: 'amount',
            rows: [{ category: 'A', avg_value: 100, sum_value: 500 }]
        },
        {
            mode: 'count',
            categoryColumn: 'status',
            numericColumn: 'id',
            rows: [{ category: 'active', avg_value: 0, sum_value: 15 }]
        }
    ];

    const charts = groupAggregationToCharts(results);
    assert.strictEqual(charts.length, 2);
    assert.strictEqual(charts[0].chartType, 'bar');
    assert.strictEqual(charts[1].chartType, 'bar');
});

test('chartSelector - descriptiveStatsToChart', () => {
    const result = {
        stats: {
            column: 'price',
            mean: 25.5,
            median: 24.0,
            stddev: 5.2,
            min: 10.0,
            max: 50.0,
            nullCount: 0,
            count: 100
        },
        histogram: [
            { binRange: '0-10', count: 5 },
            { binRange: '10-20', count: 15 },
            { binRange: '20-30', count: 30 }
        ]
    };

    const chart = descriptiveStatsToChart(result);
    assert.strictEqual(chart.chartType, 'histogram');
    assert.strictEqual(chart.title, 'Distribution of price');
    assert.strictEqual(chart.xAxisLabel, 'price (Range)');
    assert.strictEqual(chart.yAxisLabel, 'Frequency (Count)');
    assert.strictEqual(chart.data.length, 3);
    assert.strictEqual(chart.data[0].label, '0-10');
    assert.strictEqual(chart.data[0].value, 5);
    assert.deepStrictEqual(chart.statsSummary, {
        mean: 25.5,
        median: 24.0,
        stddev: 5.2,
        min: 10.0,
        max: 50.0,
        nullCount: 0,
        totalCount: 100
    });
    assert.strictEqual(chart.analysisType, 'descriptive_stats');
    assert.deepStrictEqual(chart.sourceColumns, ['price']);
});

test('chartSelector - correlationToChart', () => {
    const result = {
        column1: 'price',
        column2: 'quantity',
        correlation: 0.85,
        points: [
            { x: 10, y: 20 },
            { x: 20, y: 40 },
            { x: 30, y: 60 }
        ]
    };

    const chart = correlationToChart(result);
    assert.strictEqual(chart.chartType, 'scatter');
    assert.strictEqual(chart.availableTypes.length, 1);
    assert.strictEqual(chart.availableTypes[0], 'scatter');
    assert.strictEqual(chart.title, 'price vs quantity — r = 0.85 (Strong positive)');
    assert.strictEqual(chart.xAxisLabel, 'price');
    assert.strictEqual(chart.yAxisLabel, 'quantity');
    assert.strictEqual(chart.correlation, 0.85);
    assert.strictEqual(chart.scatterData.length, 3);
    assert.strictEqual(chart.scatterData[0].x, 10);
    assert.strictEqual(chart.scatterData[0].y, 20);
    assert.strictEqual(chart.analysisType, 'correlation');
    assert.deepStrictEqual(chart.sourceColumns, ['price', 'quantity']);
});

test('chartSelector - correlationToChart weak negative', () => {
    const result = {
        column1: 'age',
        column2: 'salary',
        correlation: -0.3,
        points: []
    };

    const chart = correlationToChart(result);
    assert.strictEqual(chart.title, 'age vs salary — r = -0.30 (Weak negative)');
});

test('chartSelector - correlationToCharts', () => {
    const results = [
        {
            column1: 'price',
            column2: 'quantity',
            correlation: 0.8,
            points: []
        },
        {
            column1: 'age',
            column2: 'salary',
            correlation: -0.5,
            points: []
        }
    ];

    const charts = correlationToCharts(results);
    assert.strictEqual(charts.length, 2);
    assert.strictEqual(charts[0].chartType, 'scatter');
    assert.strictEqual(charts[1].chartType, 'scatter');
});

test('chartSelector - timeSeriesToChart with sum', () => {
    const result = {
        mode: 'sum',
        dateColumn: 'order_date',
        numericColumn: 'amount',
        points: [
            { period: '2023-01', value: 1000 },
            { period: '2023-02', value: 1500 }
        ]
    };

    const chart = timeSeriesToChart(result);
    assert.strictEqual(chart.chartType, 'area');
    assert.strictEqual(chart.title, 'Avg amount over order_date');
    assert.strictEqual(chart.xAxisLabel, 'order_date');
    assert.strictEqual(chart.yAxisLabel, 'Avg amount');
    assert.strictEqual(chart.data.length, 2);
    assert.strictEqual(chart.data[0].label, '2023-01');
    assert.strictEqual(chart.data[0].value, 1000);
    assert.strictEqual(chart.analysisType, 'time_series');
    assert.deepStrictEqual(chart.sourceColumns, ['order_date', 'amount']);
});

test('chartSelector - timeSeriesToChart with count', () => {
    const result = {
        mode: 'count',
        dateColumn: 'order_date',
        numericColumn: 'id',
        points: [
            { period: '2023-01', value: 10 },
            { period: '2023-02', value: 15 }
        ]
    };

    const chart = timeSeriesToChart(result);
    assert.strictEqual(chart.chartType, 'area');
    assert.strictEqual(chart.title, 'Employee Count by order_date');
    assert.strictEqual(chart.xAxisLabel, 'order_date');
    assert.strictEqual(chart.yAxisLabel, 'Count');
    assert.strictEqual(chart.data.length, 2);
    assert.strictEqual(chart.data[0].label, '2023-01');
    assert.strictEqual(chart.data[0].value, 10);
    assert.strictEqual(chart.analysisType, 'time_series');
    assert.deepStrictEqual(chart.sourceColumns, ['order_date', 'id']);
});

test('chartSelector - timeSeriesToCharts', () => {
    const results = [
        {
            mode: 'sum',
            dateColumn: 'order_date',
            numericColumn: 'amount',
            points: [{ period: '2023-01', value: 1000 }]
        },
        {
            mode: 'count',
            dateColumn: 'ship_date',
            numericColumn: 'id',
            points: [{ period: '2023-01', value: 5 }]
        }
    ];

    const charts = timeSeriesToCharts(results);
    assert.strictEqual(charts.length, 2);
    assert.strictEqual(charts[0].chartType, 'area');
    assert.strictEqual(charts[1].chartType, 'area');
});