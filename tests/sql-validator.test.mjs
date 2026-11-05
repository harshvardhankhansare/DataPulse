import test from 'node:test';
import assert from 'node:assert';
import { validateSql } from '../dist/core/ai/sqlValidator.js';

test('validateSql - valid SELECT passes', () => {
    const mockSchema = { columns: [] };
    const result = validateSql('SELECT * FROM my_table', 'my_table', mockSchema);
    assert.strictEqual(result.valid, true);
});

test('validateSql - DROP rejected', () => {
    const mockSchema = { columns: [] };
    const result = validateSql('DROP TABLE my_table', 'my_table', mockSchema);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'Only SELECT (read-only) queries are allowed.');
});

test('validateSql - DELETE rejected', () => {
    const mockSchema = { columns: [] };
    const result = validateSql('DELETE FROM my_table', 'my_table', mockSchema);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'Only SELECT (read-only) queries are allowed.');
});

test('validateSql - UPDATE rejected', () => {
    const mockSchema = { columns: [] };
    const result = validateSql('UPDATE my_table SET col=1', 'my_table', mockSchema);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'Only SELECT (read-only) queries are allowed.');
});

test('validateSql - INSERT rejected', () => {
    const mockSchema = { columns: [] };
    const result = validateSql('INSERT INTO my_table VALUES (1)', 'my_table', mockSchema);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'Only SELECT (read-only) queries are allowed.');
});

test('validateSql - markdown-wrapped SQL extracted', () => {
    const mockSchema = { columns: [] };
    const result = validateSql('```sql\nSELECT * FROM my_table\n```', 'my_table', mockSchema);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.cleanSql, 'SELECT * FROM my_table');
});

test('validateSql - table-name requirement enforced', () => {
    const mockSchema = { columns: [] };
    const result = validateSql('SELECT * FROM other_table', 'my_table', mockSchema);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'Query must reference table "my_table".');
});

test('validateSql - valid SELECT with correct table name passes', () => {
    const mockSchema = { columns: [] };
    const result = validateSql('SELECT * FROM my_table', 'my_table', mockSchema);
    assert.strictEqual(result.valid, true);
});