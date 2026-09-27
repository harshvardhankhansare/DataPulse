import test from 'node:test';
import assert from 'node:assert';
import duckdb from 'duckdb';
import { detectSchema } from '../dist/core/schema/typeDetector.js';

test('detectSchema', async () => {
    const db = new duckdb.Database(':memory:');
    
    await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE test_table (
            id INTEGER,
            name VARCHAR,
            is_active BOOLEAN,
            created_at TIMESTAMP
        )`, (err) => err ? reject(err) : resolve());
    });

    await new Promise((resolve, reject) => {
        db.run(`INSERT INTO test_table VALUES 
            (1, 'Alice', true, '2023-01-01 10:00:00'),
            (2, 'Bob', false, '2023-01-02 11:00:00')
        `, (err) => err ? reject(err) : resolve());
    });

    const queryFn = (sql) => new Promise((resolve, reject) => {
        db.all(sql, (err, res) => err ? reject(err) : resolve(res));
    });

    const schema = await detectSchema('test_table', queryFn);
    
    assert.strictEqual(schema.tableName, 'test_table');
    assert(schema.columns.some(c => c.name === 'id'));
    assert(schema.columns.some(c => c.name === 'name'));
    assert(schema.columns.some(c => c.name === 'is_active'));
    assert(schema.columns.some(c => c.name === 'created_at'));
});
