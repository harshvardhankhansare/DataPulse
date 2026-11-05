import test from 'node:test';
import assert from 'node:assert';
import { heuristicQuery } from '../dist/core/ai/heuristicQuery.js';

test('heuristicQuery - top N X by Y', () => {
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'product', detectedType: 'categorical' },
            { name: 'amount', detectedType: 'numeric' },
            { name: 'date', detectedType: 'temporal' }
        ]
    };

    const result = heuristicQuery('top 5 product by amount', schema);
    assert.strictEqual(result !== null, true);
    assert.strictEqual(result.sql, 'SELECT "product", SUM("amount") AS total FROM "sales" GROUP BY "product" ORDER BY total DESC LIMIT 5');
    assert.strictEqual(result.confidence, 0.9);
    assert.strictEqual(result.explanation, 'Show top 5 product by total amount');
});

test('heuristicQuery - average of X', () => {
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'price', detectedType: 'numeric' }
        ]
    };

    const result = heuristicQuery('average price', schema);
    assert.strictEqual(result !== null, true);
    assert.strictEqual(result.sql, 'SELECT AVG("price") AS average_price FROM "sales"');
    assert.strictEqual(result.confidence, 0.85);
    assert.strictEqual(result.explanation, 'Average value of price');
});

test('heuristicQuery - average X by Y', () => {
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'price', detectedType: 'numeric' },
            { name: 'region', detectedType: 'categorical' }
        ]
    };

    const result = heuristicQuery('average price by region', schema);
    assert.strictEqual(result !== null, true);
    assert.strictEqual(result.sql, 'SELECT "region", AVG("price") AS average_price FROM "sales" GROUP BY "region"');
    assert.strictEqual(result.confidence, 0.85);
    assert.strictEqual(result.explanation, 'Average price by region');
});

test('heuristicQuery - count rows where', () => {
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'status', detectedType: 'categorical' }
        ]
    };

    const result = heuristicQuery('count rows where status = "completed"', schema);
    assert.strictEqual(result !== null, true);
    assert.strictEqual(result.sql, 'SELECT COUNT(*) AS count FROM "sales" WHERE "status" LIKE \'%completed%\'');
    assert.strictEqual(result.confidence, 0.8);
    assert.strictEqual(result.explanation, 'Count of rows where status contains \'completed\'');
});

test('heuristicQuery - total/sum of X', () => {
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'quantity', detectedType: 'numeric' }
        ]
    };

    const result = heuristicQuery('total quantity', schema);
    assert.strictEqual(result !== null, true);
    assert.strictEqual(result.sql, 'SELECT SUM("quantity") AS total_quantity FROM "sales"');
    assert.strictEqual(result.confidence, 0.85);
    assert.strictEqual(result.explanation, 'Total sum of quantity');
});

test('heuristicQuery - min/max of X', () => {
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'price', detectedType: 'numeric' }
        ]
    };

    const result = heuristicQuery('min price', schema);
    assert.strictEqual(result !== null, true);
    assert.strictEqual(result.sql, 'SELECT MIN("price") AS min_price, MAX("price") AS max_price FROM "sales"');
    assert.strictEqual(result.confidence, 0.85);
    assert.strictEqual(result.explanation, 'Minimum and maximum of price');
});

test('heuristicQuery - compare X across/by Y', () => {
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'amount', detectedType: 'numeric' },
            { name: 'category', detectedType: 'categorical' }
        ]
    };

    const result = heuristicQuery('compare amount by category', schema);
    assert.strictEqual(result !== null, true);
    assert.strictEqual(result.sql, 'SELECT "category", SUM("amount") AS total_amount FROM "sales" GROUP BY "category" ORDER BY total_amount DESC');
    assert.strictEqual(result.confidence, 0.8);
    assert.strictEqual(result.explanation, 'Compare total amount by category');
});

test('heuristicQuery - show me data', () => {
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'id', detectedType: 'numeric' }
        ]
    };

    const result = heuristicQuery('show me data', schema);
    assert.strictEqual(result !== null, true);
    assert.strictEqual(result.sql, 'SELECT * FROM "sales"');
    assert.strictEqual(result.confidence, 0.9);
    assert.strictEqual(result.explanation, 'Show all data from sales');
});

test('heuristicQuery - show me first N rows', () => {
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'id', detectedType: 'numeric' }
        ]
    };

    const result = heuristicQuery('show me first 10 rows', schema);
    assert.strictEqual(result !== null, true);
    assert.strictEqual(result.sql, 'SELECT * FROM "sales" LIMIT 10');
    assert.strictEqual(result.confidence, 0.9);
    assert.strictEqual(result.explanation, 'Show first 10 rows from sales');
});

test('heuristicQuery - unknown column returns null', () => {
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'amount', detectedType: 'numeric' }
        ]
    };

    const result = heuristicQuery('top 5 unknown by amount', schema);
    assert.strictEqual(result, null);
});

test('heuristicQuery - no matching rule returns null', () => {
    const schema = {
        tableName: 'sales',
        columns: [
            { name: 'amount', detectedType: 'numeric' }
        ]
    };

    const result = heuristicQuery('what is the meaning of life', schema);
    assert.strictEqual(result, null);
});