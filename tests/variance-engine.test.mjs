import test from 'node:test';
import assert from 'node:assert';
import { computeVarianceDecomposition } from '../dist/core/diagnostic/varianceEngine.js';

test('varianceEngine - computeVarianceDecomposition basic case', async () => {
    const tableName = 'sales';
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'region', detectedType: 'categorical' },
            { name: 'amount', detectedType: 'numeric' },
            { name: 'order_date', detectedType: 'date' }
        ]
    };
    const targetMetric = 'amount';
    const dimension = 'region';

    // Mock query function that returns predefined rows
    const queryFn = async () => {
        // We expect a query with window functions, but for simplicity we return a fixed set of rows
        // that would be returned by the SQL in the function for a given dataset.
        // We'll mock the result of the SQL query in the function.
        // The function splits the table into two halves by row number (ordered by date if available).
        // We'll simulate a table with 4 rows, two in baseline and two in comparison.
        // Let's assume the order_date column is present and we have 4 rows ordered by date.
        // The function will compute baseline (first 2 rows) and comparison (last 2 rows) per region.
        // We'll return rows for two regions: 'North' and 'South'.
        // For North: baseline values: 10, 20 -> sum 30; comparison values: 30, 40 -> sum 70
        // For South: baseline values: 5, 15 -> sum 20; comparison values: 25, 35 -> sum 60
        // We'll return the rows in the order of absolute delta descending (North then South).
        return [
            { dim_val: 'North', baseline_val: 30, comp_val: 70 },
            { dim_val: 'South', baseline_val: 20, comp_val: 60 }
        ];
    };

    const result = await computeVarianceDecomposition(tableName, schema, targetMetric, dimension, queryFn);

    assert.strictEqual(result.targetMetric, 'amount');
    assert.strictEqual(result.dimension, 'region');
    assert.strictEqual(result.baselineName, 'Historical Baseline (H1)'); // because dateCol exists
    assert.strictEqual(result.comparisonName, 'Recent Period (H2)');
    assert.strictEqual(result.totalBaseline, 50); // 30 + 20
    assert.strictEqual(result.totalComparison, 130); // 70 + 60
    assert.strictEqual(result.netDelta, 80); // 130 - 50
    assert.strictEqual(result.netPercentageChange, 160); // (80/50)*100 = 160
    assert.strictEqual(result.drivers.length, 2);

    // Check North driver
    const northDriver = result.drivers[0];
    assert.strictEqual(northDriver.name, 'North');
    assert.strictEqual(northDriver.baselineValue, 30);
    assert.strictEqual(northDriver.comparisonValue, 70);
    assert.strictEqual(northDriver.absoluteDelta, 40); // 70-30
    assert.strictEqual(northDriver.percentageChange, 133.3); // (40/30)*100 = 133.33
    // Actually, the function does: pctChange = bVal !== 0 ? (delta / Math.abs(bVal)) * 100 : delta > 0 ? 100 : 0;
    // So for North: (70-30)/30 * 100 = 40/30*100 = 133.333..., then rounded to 1 decimal: 133.3
    // But note: the function rounds percentageChange to 1 decimal: Math.round(pctChange * 10) / 10
    // So 133.33 * 10 = 1333.3, round -> 1333, /10 -> 133.3
    // absoluteDelta rounded to 2 decimals: 40 -> 40.0
    assert.strictEqual(northDriver.absoluteDelta, 40.0);
    // contributionPct: absoluteDelta / totalAbsDelta * 100, rounded to 1 decimal
    // totalAbsDelta = |40| + |40| = 80
    // contributionPct for North = 40/80*100 = 50.0
    assert.strictEqual(northDriver.contributionPct, 50.0);
    assert.strictEqual(northDriver.impact, 'boost'); // because delta > 0

    // Check South driver
    const southDriver = result.drivers[1];
    assert.strictEqual(southDriver.name, 'South');
    assert.strictEqual(southDriver.baselineValue, 20);
    assert.strictEqual(southDriver.comparisonValue, 60);
    assert.strictEqual(southDriver.absoluteDelta, 40); // 60-20
    assert.strictEqual(southDriver.percentageChange, 200.0); // (60-20)/20*100 = 40/20*100 = 200.0
    assert.strictEqual(southDriver.contributionPct, 50.0);
    assert.strictEqual(southDriver.impact, 'boost');
});

test('varianceEngine - computeVarianceDecomposition with no date column', async () => {
    const tableName = 'sales';
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'region', detectedType: 'categorical' },
            { name: 'amount', detectedType: 'numeric' }
            // no date column
        ]
    };
    const targetMetric = 'amount';
    const dimension = 'region';

    const queryFn = async () => {
        // Without date column, the orderClause is empty, so the window functions are without order.
        // But note: the function uses COUNT(*) OVER () for total_cnt and ROW_NUMBER() OVER () for rn.
        // Without order, the row numbers are arbitrary but deterministic in DuckDB? We'll assume it's stable.
        // We'll mock the same data as before but note that the split is by total_cnt/2 without order.
        // We'll just return the same two groups.
        return [
            { dim_val: 'North', baseline_val: 30, comp_val: 70 },
            { dim_val: 'South', baseline_val: 20, comp_val: 60 }
        ];
    };

    const result = await computeVarianceDecomposition(tableName, schema, targetMetric, dimension, queryFn);

    assert.strictEqual(result.baselineName, 'Baseline Cohort (H1)'); // because no dateCol
    assert.strictEqual(result.comparisonName, 'Recent Cohort (H2)');
    // The rest should be the same as above.
    assert.strictEqual(result.totalBaseline, 50);
    assert.strictEqual(result.totalComparison, 130);
    assert.strictEqual(result.netDelta, 80);
    assert.strictEqual(result.netPercentageChange, 160);
});

test('varianceEngine - computeVarianceDecomposition with zero baseline', async () => {
    const tableName = 'sales';
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'region', detectedType: 'categorical' },
            { name: 'amount', detectedType: 'numeric' },
            { name: 'order_date', detectedType: 'date' }
        ]
    };
    const targetMetric = 'amount';
    const dimension = 'region';

    const queryFn = async () => {
        // One region with baseline 0, comparison 10
        return [
            { dim_val: 'ZeroBaseline', baseline_val: 0, comp_val: 10 }
        ];
    };

    const result = await computeVarianceDecomposition(tableName, schema, targetMetric, dimension, queryFn);

    assert.strictEqual(result.totalBaseline, 0);
    assert.strictEqual(result.totalComparison, 10);
    assert.strictEqual(result.netDelta, 10);
    // When totalBaseline is 0, netPercentageChange is set to 100 if netDelta > 0
    assert.strictEqual(result.netPercentageChange, 100);
    assert.strictEqual(result.drivers.length, 1);
    const driver = result.drivers[0];
    assert.strictEqual(driver.name, 'ZeroBaseline');
    assert.strictEqual(driver.baselineValue, 0);
    assert.strictEqual(driver.comparisonValue, 10);
    assert.strictEqual(driver.absoluteDelta, 10);
    // percentageChange: bVal === 0 ? (delta > 0 ? 100 : 0) : ... -> 100
    assert.strictEqual(driver.percentageChange, 100);
    // contributionPct: totalAbsDelta = 10, so 10/10*100 = 100
    assert.strictEqual(driver.contributionPct, 100);
    assert.strictEqual(driver.impact, 'boost');
});

test('varianceEngine - computeVarianceDecomposition with negative delta (drag)', async () => {
    const tableName = 'sales';
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'region', detectedType: 'categorical' },
            { name: 'amount', detectedType: 'numeric' },
            { name: 'order_date', detectedType: 'date' }
        ]
    };
    const targetMetric = 'amount';
    const dimension = 'region';

    const queryFn = async () => {
        // Region with baseline 50, comparison 30 -> delta -20 (drag)
        return [
            { dim_val: 'Declining', baseline_val: 50, comp_val: 30 }
        ];
    };

    const result = await computeVarianceDecomposition(tableName, schema, targetMetric, dimension, queryFn);

    assert.strictEqual(result.netDelta, -20);
    assert.strictEqual(result.netPercentageChange, -40); // (-20/50)*100 = -40
    assert.strictEqual(result.drivers.length, 1);
    const driver = result.drivers[0];
    assert.strictEqual(driver.name, 'Declining');
    assert.strictEqual(driver.baselineValue, 50);
    assert.strictEqual(driver.comparisonValue, 30);
    assert.strictEqual(driver.absoluteDelta, -20); // signed delta: 30-50 = -20
    assert.strictEqual(driver.percentageChange, -40.0); // (30-50)/50*100 = -40
    assert.strictEqual(driver.contributionPct, 100);
    assert.strictEqual(driver.impact, 'drag'); // because d.absoluteDelta < 0? Wait, look at the code:
    //     let impact: ImpactType = 'neutral';
    //     if (d.absoluteDelta < 0) {
    //       impact = 'drag';
    //     } else if (d.absoluteDelta > 0) {
    //       impact = 'boost';
    //     }
    // But note: d.absoluteDelta is always non-negative because it's Math.round(delta * 100) / 100 and then we take absolute? 
    // Actually, look at the code:
    //     absoluteDelta: Math.round(delta * 100) / 100,
    // and delta can be negative. Then absoluteDelta is the rounded delta (which can be negative).
    // Then in the impact calculation:
    //     if (d.absoluteDelta < 0) {
    //       impact = 'drag';
    //     } else if (d.absoluteDelta > 0) {
    //       impact = 'boost';
    //     }
    // So if delta is negative, absoluteDelta is negative, then impact is 'drag'.
    // Let's check: in our mock, delta = -20, absoluteDelta = -20 (rounded).
    // So impact should be 'drag'.
    assert.strictEqual(driver.impact, 'drag');
});
