import test from 'node:test';
import assert from 'node:assert';
import duckdb from 'duckdb';
import { detectPii } from '../dist/core/privacy/piiDetector.js';

test('detectPii', async () => {
    const db = new duckdb.Database(':memory:');
    
    await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE test_pii (
            email VARCHAR,
            phone VARCHAR,
            ssn VARCHAR,
            safe_col VARCHAR
        )`, (err) => err ? reject(err) : resolve());
    });

    await new Promise((resolve, reject) => {
        db.run(`INSERT INTO test_pii VALUES 
            ('john@test.com', '555-123-4567', '123-45-6789', 'public data'),
            ('alice@example.com', '555-987-6543', '987-65-4321', 'more data')
        `, (err) => err ? reject(err) : resolve());
    });

    const queryFn = (sql) => new Promise((resolve, reject) => {
        db.all(sql, (err, res) => err ? reject(err) : resolve(res));
    });

    const mockSchema = {
        tableName: 'test_pii',
        columns: [
            { name: 'email', detectedType: 'text', nullCount: 0, totalRows: 2 },
            { name: 'phone', detectedType: 'text', nullCount: 0, totalRows: 2 },
            { name: 'ssn', detectedType: 'text', nullCount: 0, totalRows: 2 },
            { name: 'safe_col', detectedType: 'text', nullCount: 0, totalRows: 2 }
        ]
    };

    const report = await detectPii('test_pii', mockSchema, queryFn);
    
    assert(report.piiColumnsCount > 0);
    
    // Check that we detected pii in the expected columns
    const detectedCols = report.detections.map(d => d.column);
    assert(detectedCols.includes('email'));
    assert(detectedCols.includes('phone'));
    assert(detectedCols.includes('ssn'));
    assert(!detectedCols.includes('safe_col'));
});
