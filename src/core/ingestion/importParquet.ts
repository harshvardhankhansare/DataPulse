type QueryFunction = (sql: string) => Promise<any[]>;

export async function importParquet(
  filePath: string,
  tableName: string,
  queryFn: QueryFunction
): Promise<void> {
  try {
    const normalizedPath = filePath.replace(/\\/g, '/').replace(/'/g, "''");
    if (!normalizedPath) throw new Error('File path is empty');
    const sql = `CREATE TABLE ${tableName} AS SELECT * FROM read_parquet('${normalizedPath}')`;
    await queryFn(sql);
  } catch (error) {
    const err = new Error(`Failed to import Parquet from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    (err as any).cause = error;
    throw err;
  }
}
