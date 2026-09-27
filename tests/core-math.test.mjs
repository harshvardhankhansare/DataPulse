import test from 'node:test';
import assert from 'node:assert';
import { selectApplicableAnalyses } from '../dist/core/rules/ruleEngine.js';
import { validateSql } from '../dist/core/ai/sqlValidator.js';
import { buildSystemPrompt } from '../dist/core/ai/promptBuilder.js';

test('selectApplicableAnalyses', () => {
    const mockSchema = {
        tableName: 'test_table',
        columns: [
            { name: 'amount', detectedType: 'numeric', nullCount: 0, totalRows: 1 },
            { name: 'status', detectedType: 'categorical', nullCount: 0, totalRows: 1 },
            { name: 'created_at', detectedType: 'temporal', nullCount: 0, totalRows: 1 }
        ]
    };
    const analyses = selectApplicableAnalyses(mockSchema);
    assert(Array.isArray(analyses));
});

test('validateSql', () => {
    const mockSchema = { columns: [] };
    const validResult = validateSql('SELECT * FROM my_table', 'my_table', mockSchema);
    assert.strictEqual(validResult.valid, true);
    
    const dropResult = validateSql('DROP TABLE my_table', 'my_table', mockSchema);
    assert.strictEqual(dropResult.valid, false);
    
    const deleteResult = validateSql('DELETE FROM my_table', 'my_table', mockSchema);
    assert.strictEqual(deleteResult.valid, false);
});

test('buildSystemPrompt', () => {
    const mockSchema = { columns: [] };
    const prompt = buildSystemPrompt('my_awesome_table', mockSchema);
    assert.strictEqual(typeof prompt, 'string');
    assert(prompt.includes('my_awesome_table'));
});
