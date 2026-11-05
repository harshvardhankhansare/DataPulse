export function heuristicQuery(
    question: string,
    schema: { tableName: string; columns: Array<{ name: string; detectedType: string }> }
): { sql: string; confidence: number; explanation: string } | null {
    const q = question.trim().toLowerCase();
    const tableName = schema.tableName;

    // Helper to find a column by fuzzy match (exact match for now, case-insensitive)
    const findColumn = (token: string): string | undefined => {
        return schema.columns.find(c => c.name.toLowerCase() === token)?.name;
    };

    // Helper to find a column that contains the token (substring match)
    const findColumnContaining = (token: string): string | undefined => {
        return schema.columns.find(c => c.name.toLowerCase().includes(token))?.name;
    };

    // Rule 1: "top N X by Y" (optional "show " prefix) -> SELECT X, SUM(Y) FROM table GROUP BY X ORDER BY 2 DESC LIMIT N
    const topNMatch = q.match(/^(?:show\s+)?top\s+(\d+)\s+(.+?)\s+by\s+(.+)$/);
    if (topNMatch) {
        const [, nStr, xToken, yToken] = topNMatch;
        const n = parseInt(nStr, 10);
        const xCol = findColumn(xToken) || findColumnContaining(xToken);
        const yCol = findColumn(yToken) || findColumnContaining(yToken);
        if (xCol && yCol && !isNaN(n)) {
            const sql = `SELECT "${xCol}", SUM("${yCol}") AS total FROM "${tableName}" GROUP BY "${xCol}" ORDER BY total DESC LIMIT ${n}`;
            return {
                sql,
                confidence: 0.9,
                explanation: `Show top ${n} ${xCol} by total ${yCol}`,
            };
        }
    }

    // Rule 2: "average/mean of X" -> SELECT AVG(X) FROM table
    const avgOfMatch = q.match(/^(?:average|mean)(?:\s+of)?\s+(.+)$/);
    if (avgOfMatch) {
        const [, xToken] = avgOfMatch;
        const xCol = findColumn(xToken) || findColumnContaining(xToken);
        if (xCol) {
            const sql = `SELECT AVG("${xCol}") AS average_${xCol} FROM "${tableName}"`;
            return {
                sql,
                confidence: 0.85,
                explanation: `Average value of ${xCol}`,
            };
        }
    }

    // Rule 2b: "average X by Y" -> SELECT Y, AVG(X) FROM table GROUP BY Y
    const avgByMatch = q.match(/^(?:average|mean)\s+(.+?)\s+by\s+(.+)$/);
    if (avgByMatch) {
        const [, xToken, yToken] = avgByMatch;
        const xCol = findColumn(xToken) || findColumnContaining(xToken);
        const yCol = findColumn(yToken) || findColumnContaining(yToken);
        if (xCol && yCol) {
            const sql = `SELECT "${yCol}", AVG("${xCol}") AS average_${xCol} FROM "${tableName}" GROUP BY "${yCol}"`;
            return {
                sql,
                confidence: 0.85,
                explanation: `Average ${xCol} by ${yCol}`,
            };
        }
    }

    // Rule 3: "count rows where ..." -> COUNT with WHERE condition (simplified: we look for a column and a value)
    const countWhereMatch = q.match(/^count\s+(?:rows|records)\s+where\s+(.+)$/);
    if (countWhereMatch) {
        const [, condition] = countWhereMatch;
        // Very basic: look for a column name and a value in quotes or a number
        // We'll try to split by common operators: =, !=, like, etc.
        // For simplicity, we'll assume the condition is in the form: column 'value' or column = value
        const columnMatch = condition.match(/^(\w+)\s*(?:=|like)\s*['"](.+)['"]$/i);
        if (columnMatch) {
            const [, colToken, value] = columnMatch;
            const col = findColumn(colToken) || findColumnContaining(colToken);
            if (col) {
                const sql = `SELECT COUNT(*) AS count FROM "${tableName}" WHERE "${col}" LIKE '%${value}%'`;
                return {
                    sql,
                    confidence: 0.8,
                    explanation: `Count of rows where ${col} contains '${value}'`,
                };
            }
        }
        // If we can't parse the condition, we might return a generic count without condition? But the rule says with condition.
        // We'll return null for now if we can't parse.
    }

    // Rule 4: "total/sum of X" -> SELECT SUM(X) FROM table
    const sumMatch = q.match(/^(?:total|sum)(?:\s+of)?\s+(.+)$/);
    if (sumMatch) {
        const [, xToken] = sumMatch;
        const xCol = findColumn(xToken) || findColumnContaining(xToken);
        if (xCol) {
            const sql = `SELECT SUM("${xCol}") AS total_${xCol} FROM "${tableName}"`;
            return {
                sql,
                confidence: 0.85,
                explanation: `Total sum of ${xCol}`,
            };
        }
    }

    // Rule 5: "min/max of X" -> SELECT MIN(X), MAX(X) FROM table
    const minMaxMatch = q.match(/^(?:min|max)(?:\s+of)?\s+(.+)$/);
    if (minMaxMatch) {
        const [, xToken] = minMaxMatch;
        const xCol = findColumn(xToken) || findColumnContaining(xToken);
        if (xCol) {
            const sql = `SELECT MIN("${xCol}") AS min_${xCol}, MAX("${xCol}") AS max_${xCol} FROM "${tableName}"`;
            return {
                sql,
                confidence: 0.85,
                explanation: `Minimum and maximum of ${xCol}`,
            };
        }
    }

    // Rule 6: "compare X across/by Y" -> SELECT Y, SUM(X) FROM table GROUP BY Y (assuming we want to compare the sum of X across Y)
    const compareMatch = q.match(/^compare\s+(.+?)\s+(?:across|by)\s+(.+)$/);
    if (compareMatch) {
        const [, xToken, yToken] = compareMatch;
        const xCol = findColumn(xToken) || findColumnContaining(xToken);
        const yCol = findColumn(yToken) || findColumnContaining(yToken);
        if (xCol && yCol) {
            const sql = `SELECT "${yCol}", SUM("${xCol}") AS total_${xCol} FROM "${tableName}" GROUP BY "${yCol}" ORDER BY total_${xCol} DESC`;
            return {
                sql,
                confidence: 0.8,
                explanation: `Compare total ${xCol} by ${yCol}`,
            };
        }
    }

    // Rule 7: "show me data" or "first N rows" -> SELECT * FROM table [LIMIT N]
    const showDataMatch = q.match(/^show\s+me\s+(?:all\s+)?data$/);
    if (showDataMatch) {
        const sql = `SELECT * FROM "${tableName}"`;
        return {
            sql,
            confidence: 0.9,
            explanation: `Show all data from ${tableName}`,
        };
    }

    const firstNMatch = q.match(/^show\s+me\s+first\s+(\d+)\s+rows$/);
    if (firstNMatch) {
        const [, nStr] = firstNMatch;
        const n = parseInt(nStr, 10);
        if (!isNaN(n)) {
            const sql = `SELECT * FROM "${tableName}" LIMIT ${n}`;
            return {
                sql,
                confidence: 0.9,
                explanation: `Show first ${n} rows from ${tableName}`,
            };
        }
    }

    // If no rule matches, return null
    return null;
}