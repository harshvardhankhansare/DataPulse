import * as XLSXModule from 'xlsx';
import fs from 'fs';
import path from 'path';
import os from 'os';

const XLSX = (XLSXModule as any).default || XLSXModule;

type QueryFunction = (sql: string) => Promise<any[]>;

export async function importXlsx(
  filePath: string,
  tableName: string,
  queryFn: QueryFunction,
  sheetIndex: number = 0
): Promise<void> {
  try {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Excel workbook contains no sheets');
    }

    const sheetName = workbook.SheetNames[sheetIndex] || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Sheet "${sheetName}" could not be read`);
    }

    const csvContent = XLSX.utils.sheet_to_csv(worksheet, { FS: ',', RS: '\n' });
    if (!csvContent || csvContent.trim().length === 0) {
      throw new Error('Selected sheet is empty');
    }

    // Write temp CSV file in OS tmpdir
    const tempCsvPath = path.join(os.tmpdir(), `odi_import_${Date.now()}_${Math.random().toString(36).slice(2)}.csv`);
    fs.writeFileSync(tempCsvPath, csvContent, 'utf-8');

    try {
      const normalizedPath = tempCsvPath.replace(/\\/g, '/').replace(/'/g, "''");
      const sql = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${normalizedPath}')`;
      await queryFn(sql);
    } finally {
      try {
        if (fs.existsSync(tempCsvPath)) {
          fs.unlinkSync(tempCsvPath);
        }
      } catch {
        // Ignore cleanup error
      }
    }
  } catch (error) {
    throw new Error(`Failed to import Excel spreadsheet from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
