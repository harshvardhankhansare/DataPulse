export interface SqlValidationResult {
  valid: boolean;
  cleanSql?: string;
  error?: string;
}

export function extractSqlFromText(rawText: string): string {
  let text = rawText.trim();

  // Extract from markdown code block if present
  const codeBlockMatch = text.match(/```(?:sql)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  // Remove trailing semicolons or markdown formatting
  text = text.replace(/;+\s*$/, '').trim();

  // If there's leading narrative text before SELECT/WITH, slice from SELECT/WITH
  const selectIdx = text.search(/\b(SELECT|WITH)\b/i);
  if (selectIdx !== -1) {
    text = text.substring(selectIdx).trim();
  }

  return text;
}

export function validateSql(rawSql: string, tableName: string): SqlValidationResult {
  const cleanSql = extractSqlFromText(rawSql);

  if (!cleanSql) {
    return { valid: false, error: 'No SQL query found in LLM response' };
  }

  // 1. Must start with SELECT or WITH
  if (!cleanSql.toUpperCase().startsWith('SELECT') && !cleanSql.toUpperCase().startsWith('WITH')) {
    return { valid: false, error: 'Only SELECT (read-only) queries are allowed.' };
  }

  // 2. Forbidden mutating keywords
  const forbidden = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|EXEC|ATTACH|DETACH|COPY|PRAGMA)\b/i;
  if (forbidden.test(cleanSql)) {
    return { valid: false, error: 'Query contains forbidden modifying operations.' };
  }

  // 3. Must reference the table
  const tableRegex = new RegExp(`\\b${tableName}\\b|"${tableName}"`, 'i');
  if (!tableRegex.test(cleanSql)) {
    return { valid: false, error: `Query must reference table "${tableName}".` };
  }

  return { valid: true, cleanSql };
}
