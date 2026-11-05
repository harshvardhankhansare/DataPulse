import fs from 'fs';
import zlib from 'zlib';

type QueryFunction = (sql: string) => Promise<any[]>;

/**
 * Minimal ZIP entry reader built on Node stdlib (no external dependency).
 * An .xlsx file is a ZIP archive; sheet names live inside xl/workbook.xml.
 * Used only to resolve a numeric sheet index to a sheet name, because
 * DuckDB's read_xlsx `sheet` option expects a name.
 */
function readZipEntry(buffer: Buffer, entryName: string): Buffer | null {
  // 1. Locate the End of Central Directory record (signature 0x06054b50).
  //    Scan backwards from the end; the EOCD is at most 22 + 65535 bytes from it.
  const EOCD_SIG = 0x06054b50;
  const scanStart = Math.max(0, buffer.length - 65557);
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= scanStart; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return null;

  // 2. Walk the central directory entries.
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  let ptr = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) return null; // central directory signature
    const method = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);
    const name = buffer.toString('utf8', ptr + 46, ptr + 46 + nameLen);

    if (name === entryName) {
      // 3. Read the local file header, then the compressed payload.
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) return null;
      const lhNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
      const lhExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return Buffer.from(data); // stored (no compression)
      if (method === 8) return zlib.inflateRawSync(data); // deflate
      return null; // unsupported compression method
    }

    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Returns the sheet names of an .xlsx workbook, in order. */
function getSheetNames(filePath: string): string[] {
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch {
    return [];
  }
  const workbookXml = readZipEntry(buffer, 'xl/workbook.xml');
  if (!workbookXml) return [];

  const xml = workbookXml.toString('utf8');
  const names: string[] = [];
  const sheetRegex = /<sheet\b[^>]*\bname="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = sheetRegex.exec(xml)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/**
 * Imports an Excel (.xlsx) spreadsheet into a DuckDB table using the
 * statically-linked `xlsx` extension — fully offline, no external dependency.
 *
 * Note: DuckDB's read_xlsx only supports the modern .xlsx format.
 * Legacy .xls files must be re-saved as .xlsx.
 */
export async function importXlsx(
  filePath: string,
  tableName: string,
  queryFn: QueryFunction,
  sheetIndex: number = 0
): Promise<void> {
  try {
    let sheetClause = '';
    if (sheetIndex > 0) {
      const sheetNames = getSheetNames(filePath);
      if (sheetNames.length === 0) {
        throw new Error('Excel workbook contains no readable sheets');
      }
      const sheetName = sheetNames[sheetIndex];
      if (!sheetName) {
        throw new Error(
          `Sheet index ${sheetIndex} is out of range (workbook has ${sheetNames.length} sheet${sheetNames.length === 1 ? '' : 's'})`
        );
      }
      sheetClause = `, sheet = '${sheetName.replace(/'/g, "''")}'`;
    }

    const normalizedPath = filePath.replace(/\\/g, '/').replace(/'/g, "''");
    const sql = `CREATE TABLE ${tableName} AS SELECT * FROM read_xlsx('${normalizedPath}', header = true${sheetClause})`;
    await queryFn(sql);

    // Sanity check: the imported sheet must not be empty.
    const countRows = await queryFn(`SELECT COUNT(*) AS c FROM ${tableName}`);
    if (Number(countRows[0]?.c ?? 0) === 0) {
      throw new Error('Selected sheet is empty');
    }
  } catch (error) {
    throw new Error(
      `Failed to import Excel spreadsheet from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}
