type QueryFunction = (sql: string) => Promise<any[]>;

export async function importCsv(
  filePath: string,
  tableName: string,
  queryFn: QueryFunction
): Promise<void> {
  try {
    // Normalize Windows backslashes to forward slashes (DuckDB expects forward slashes)
    // Also escape single quotes in path
    const normalizedPath = filePath.replace(/\\/g, '/').replace(/'/g, "''");
    if (!normalizedPath) throw new Error('File path is empty');
    const sql = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${normalizedPath}')`;
    await queryFn(sql);
  } catch (error) {
    throw new Error(`Failed to import CSV from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
