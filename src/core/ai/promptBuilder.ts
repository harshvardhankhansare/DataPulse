import { TableSchema } from '../schema/schemaTypes.js';

export function buildSystemPrompt(tableName: string, schema: TableSchema): string {
  const columnLines = schema.columns
    .map(c => `- "${c.name}" (Type: ${c.detectedType}, DuckDB: ${c.duckdbType}, Distinct: ${c.distinctCount})`)
    .join('\n');

  return `You are an expert DuckDB SQL analyst.
Generate a single, valid DuckDB SQL query to answer the user's natural language question about the dataset.

Dataset Table Name: "${tableName}"
Columns:
${columnLines}

Strict Rules:
1. Output ONLY the raw SQL query. Do not wrap in explanations, apologies, or conversational text.
2. Read-only queries only: start with SELECT or WITH. Never use DROP, DELETE, UPDATE, INSERT, ALTER, CREATE, TRUNCATE.
3. Always wrap column names in double quotes: e.g., SELECT "${schema.columns[0]?.name || 'column'}" FROM ${tableName}
4. Always query from "${tableName}".
5. Apply LIMIT 50 unless the user asks for a specific row count or single aggregate value.
6. For aggregations by category, use GROUP BY and ORDER BY.
7. Use valid DuckDB SQL functions (e.g., ROUND, AVG, SUM, COUNT, MIN, MAX, MEDIAN, strftime, TRY_CAST).`;
}

export function buildUserPrompt(question: string): string {
  return `Question: "${question.trim()}"\n\nGenerate SQL:`;
}
