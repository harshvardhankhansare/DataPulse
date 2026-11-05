import path from 'path';
import { importCsv } from './importCsv.js';
import { importXlsx } from './importXlsx.js';
import { importJson } from './importJson.js';
import { importParquet } from './importParquet.js';

type QueryFunction = (sql: string) => Promise<any[]>;

export type SupportedFormat = 'csv' | 'xlsx' | 'xls' | 'json' | 'parquet';

export async function importFile(
  filePath: string,
  tableName: string,
  queryFn: QueryFunction
): Promise<{ format: SupportedFormat }> {
  const ext = path.extname(filePath).toLowerCase().replace('.', '') as SupportedFormat;

  if (ext === 'csv') {
    await importCsv(filePath, tableName, queryFn);
    return { format: 'csv' };
  }

  if (ext === 'xlsx') {
    await importXlsx(filePath, tableName, queryFn);
    return { format: ext };
  }

  if (ext === 'xls') {
    throw new Error(
      'Legacy .xls files are not supported. Please re-save the file as .xlsx (modern Excel format) and try again.'
    );
  }

  if (ext === 'json') {
    await importJson(filePath, tableName, queryFn);
    return { format: 'json' };
  }

  if (ext === 'parquet') {
    await importParquet(filePath, tableName, queryFn);
    return { format: 'parquet' };
  }

  throw new Error(`Unsupported file extension ".${ext}". Supported formats: CSV, XLSX, XLS, JSON, Parquet.`);
}
