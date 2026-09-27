import test from 'node:test';
import assert from 'node:assert';
import duckdb from 'duckdb';
import { profileQuality } from '../dist/core/profiler/qualityScore.js';

test('profileQuality', async () => {
    const db = new duckdb.Database(':memory:');
    
    await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE test_quality (
            id INTEGER,
            val VARCHAR
        )`, (err) => err ? reject(err) : resolve());
    });

    await new Promise((resolve, reject) => {
        db.run(`INSERT INTO test_quality VALUES 
            (1, 'A'),
            (2, NULL),
            (2, NULL)
        `, (err) => err ? reject(err) : resolve());
    });

    const queryFn = (sql) => new Promise((resolve, reject) => {
        db.all(sql, (err, res) => err ? reject(err) : resolve(res));
    });

    const mockSchema = {
        tableName: 'test_quality',
        columns: [
            { name: 'id', detectedType: 'numeric', nullCount: 0, totalRows: 3, distinctCount: 2 },
            { name: 'val', detectedType: 'categorical', nullCount: 2, totalRows: 3, distinctCount: 1 }
        ]
    };

    const report = await profileQuality('test_quality', mockSchema, queryFn);
    assert(typeof report.overallScore === 'number');
    assert(report.overallScore >= 0 && report.overallScore <= 100);
    // At least one issue should be reported due to nulls or duplicates
    assert(report.issues.length > 0);
});
