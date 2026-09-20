# Data Ingestion

## 1. Overview

This document describes the data import pipeline, covering file format support, validation, parsing strategies, and error handling for getting external data into DuckDB.

## 2. Supported File Formats

### 2.1 Format Summary

| Format | Phase | Priority | Status | Use Case |
|--------|-------|----------|--------|----------|
| CSV | 1 | Critical | ✅ Implemented | Most common, universal support |
| XLSX | 6 | High | 📋 Planned | Excel exports, business data |
| JSON | 6 | Medium | 📋 Planned | API exports, web data |
| Parquet | 6 | Medium | 📋 Planned | Data engineering pipelines |

### 2.2 Format Limitations

**CSV:**
- Well-formed files only (consistent delimiters, proper escaping)
- UTF-8 encoding (non-UTF-8 may cause errors)
- Maximum tested size: 1M rows, 500 columns
- Header row required (first row = column names)

**XLSX:**
- Single sheet import (first sheet by default)
- Values only (no formulas, macros, or charts)
- Maximum 1,048,576 rows (Excel limit)
- Slower than CSV (JavaScript parsing overhead)

**JSON:**
- Array of objects: `[{...}, {...}]`
- Newline-delimited: `{...}\n{...}\n`
- Nested objects flattened up to 2 levels
- Not suitable for deeply hierarchical data

**Parquet:**
- Apache Parquet format only
- Already optimized (no special limitations)
- Best for large datasets (columnar, compressed)

**NOT Supported:**
- XML, HTML, unstructured text
- Images, audio, video, PDFs
- Database connection strings (no live DB access)
- Multi-file imports (zip archives)
- Streaming or real-time data

## 3. CSV Import (Phase 1)

### 3.1 Implementation Strategy

**Use DuckDB's native CSV reader (not Node.js CSV parser):**

```typescript
// src/core/ingestion/importCsv.ts
import { Database } from 'duckdb';

export async function importCsv(
  db: Database,
  filePath: string
): Promise<{ tableName: string; rowCount: number }> {
  // Drop existing table if present
  await db.exec('DROP TABLE IF EXISTS dataset');
  
  // Import using DuckDB's read_csv_auto()
  const sql = `
    CREATE TABLE dataset AS 
    SELECT * FROM read_csv_auto(?)
  `;
  
  await db.prepare(sql).run(filePath);
  
  // Get row count
  const result = await db.prepare('SELECT COUNT(*) as count FROM dataset').get();
  
  return {
    tableName: 'dataset',
    rowCount: result.count
  };
}
```

**Why `read_csv_auto()` instead of Node.js parsers:**
- **Performance:** Native C++ implementation (10-100x faster)
- **Automatic detection:** Delimiter, quote char, types inferred
- **Memory efficient:** Streaming parser (doesn't load entire file into JS)
- **Robustness:** Handles quoted fields, escapes, irregular rows

### 3.2 File Selection Flow

```
1. User clicks "Import CSV" button
   ↓
2. Electron dialog.showOpenDialog({ filters: [{ name: 'CSV', extensions: ['csv'] }] })
   ↓
3. User selects file, returns filePath
   ↓
4. Renderer sends IPC: ipcRenderer.invoke('import-csv', filePath)
   ↓
5. Main process validates file (exists, readable, size check)
   ↓
6. Call importCsv(db, filePath)
   ↓
7. Return result or error to renderer
```

**Validation checks (before import):**
```typescript
import fs from 'fs';

function validateCsvFile(filePath: string): void {
  // Check file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  // Check file is readable
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch {
    throw new Error(`File not readable: ${filePath}`);
  }
  
  // Check file size (warn if > 100MB)
  const stats = fs.statSync(filePath);
  const sizeMB = stats.size / (1024 * 1024);
  
  if (sizeMB > 100) {
    // Show warning but allow import
    console.warn(`Large file (${sizeMB.toFixed(1)}MB) - import may be slow`);
  }
  
  if (sizeMB > 500) {
    throw new Error(`File too large (${sizeMB.toFixed(1)}MB) - maximum 500MB`);
  }
  
  // Check extension
  if (!filePath.toLowerCase().endsWith('.csv')) {
    throw new Error('File must have .csv extension');
  }
}
```

### 3.3 CSV Import Options

**DuckDB `read_csv_auto()` parameters:**

```sql
SELECT * FROM read_csv_auto('file.csv',
  -- Automatic detection (default behavior)
  delim = NULL,              -- Auto-detect delimiter (comma, tab, semicolon, pipe)
  quote = '"',               -- Quote character
  escape = '"',              -- Escape character (double-quote)
  header = true,             -- First row is column names
  
  -- Type inference
  sample_size = 20480,       -- Rows to sample for type detection
  all_varchar = false,       -- Don't force all columns to VARCHAR
  
  -- Error handling
  ignore_errors = false,     -- Fail on malformed rows (strict mode)
  max_line_size = 2097152,   -- 2MB per line (prevent runaway lines)
  
  -- Null handling
  null_padding = true,       -- Pad short rows with NULLs
  nullstr = ['', 'NULL', 'null', 'NA', 'N/A']  -- Strings to interpret as NULL
);
```

**Our defaults (Phase 1):**
- Use DuckDB defaults (automatic detection)
- Strict mode (`ignore_errors = false`) — fail on bad data
- Phase 6: add option for lenient mode (skip bad rows)

### 3.4 Error Handling

**Common CSV errors:**

1. **Malformed rows (inconsistent columns):**
   - Error: `"CSV Error: Expected X columns but got Y"`
   - Cause: Missing delimiter, unquoted newlines in data
   - Fix: User must correct CSV file

2. **Invalid encoding:**
   - Error: `"Invalid UTF-8 sequence"`
   - Cause: File not UTF-8 (often Latin-1 or Windows-1252)
   - Fix: Re-save file as UTF-8

3. **File locked:**
   - Error: `"EACCES: permission denied"`
   - Cause: File open in Excel or another program
   - Fix: Close file and retry

4. **Empty file:**
   - Error: `"No columns found"`
   - Cause: Empty file or only whitespace
   - Fix: Check file has data

**Error response format:**
```typescript
interface ImportError {
  error: string;              // User-friendly message
  code: string;               // Error code (for programmatic handling)
  details?: string;           // Technical details (for debugging)
  suggestion?: string;        // What user should do
}

// Example
{
  error: "Failed to import CSV",
  code: "MALFORMED_CSV",
  details: "Row 47: Expected 10 columns but found 8",
  suggestion: "Check the file for missing commas or incorrect line breaks"
}
```

## 4. XLSX Import (Phase 6)

### 4.1 Implementation Strategy

**Use SheetJS (xlsx package) to parse, then insert into DuckDB:**

```typescript
// src/core/ingestion/importXlsx.ts
import * as XLSX from 'xlsx';
import { Database } from 'duckdb';

export async function importXlsx(
  db: Database,
  filePath: string,
  options: { sheetIndex?: number } = {}
): Promise<{ tableName: string; rowCount: number }> {
  // Parse XLSX file
  const workbook = XLSX.readFile(filePath);
  
  // Select sheet
  const sheetIndex = options.sheetIndex ?? 0;
  const sheetName = workbook.SheetNames[sheetIndex];
  
  if (!sheetName) {
    throw new Error(`Sheet index ${sheetIndex} not found`);
  }
  
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON (array of objects, headers from first row)
  const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);
  
  if (jsonData.length === 0) {
    throw new Error('Sheet is empty');
  }
  
  // Create table schema from first row
  const columns = Object.keys(jsonData[0]);
  const columnDefs = columns.map(col => `"${sanitizeColumnName(col)}" VARCHAR`).join(', ');
  
  await db.exec('DROP TABLE IF EXISTS dataset');
  await db.exec(`CREATE TABLE dataset (${columnDefs})`);
  
  // Insert data
  const placeholders = columns.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT INTO dataset VALUES (${placeholders})`);
  
  for (const row of jsonData) {
    const values = columns.map(col => row[col] ?? null);
    stmt.run(...values);
  }
  
  return {
    tableName: 'dataset',
    rowCount: jsonData.length
  };
}

function sanitizeColumnName(name: string): string {
  // Remove special characters, replace spaces with underscores
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[0-9]/, '_$&');  // Column names can't start with digit
}
```

### 4.2 XLSX Parsing Options

**SheetJS configuration:**
```typescript
const workbook = XLSX.readFile(filePath, {
  type: 'file',
  cellDates: true,        // Parse date cells as Date objects
  cellFormula: false,     // Ignore formulas (use values only)
  cellStyles: false,      // Ignore formatting
  sheetRows: 0            // 0 = read all rows (can limit for preview)
});
```

**Sheet selection:**
- Default: first sheet (`SheetNames[0]`)
- Future enhancement: let user choose from sheet list

### 4.3 Performance Considerations

**SheetJS is slow for large files:**
- Written in JavaScript (not native)
- Must parse entire file into memory
- ~5-10 seconds for 10MB file

**Mitigation:**
- Show progress indicator during import
- Warn user if file > 10MB
- Consider streaming approach (future)

## 5. JSON Import (Phase 6)

### 5.1 Implementation Strategy

**Method 1: DuckDB native (for simple JSON):**

```typescript
// src/core/ingestion/importJson.ts
import { Database } from 'duckdb';

export async function importJson(
  db: Database,
  filePath: string
): Promise<{ tableName: string; rowCount: number }> {
  await db.exec('DROP TABLE IF EXISTS dataset');
  
  // Try DuckDB's native JSON reader first
  try {
    const sql = `CREATE TABLE dataset AS SELECT * FROM read_json_auto(?)`;
    await db.prepare(sql).run(filePath);
    
    const result = await db.prepare('SELECT COUNT(*) as count FROM dataset').get();
    return { tableName: 'dataset', rowCount: result.count };
    
  } catch (error) {
    // Fallback: manual parsing for nested JSON
    return await importJsonManual(db, filePath);
  }
}
```

**Method 2: Manual parsing (for nested JSON):**

```typescript
import fs from 'fs';

async function importJsonManual(
  db: Database,
  filePath: string
): Promise<{ tableName: string; rowCount: number }> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  
  // Ensure array of objects
  const rows = Array.isArray(data) ? data : [data];
  
  if (rows.length === 0) {
    throw new Error('JSON file is empty');
  }
  
  // Flatten nested objects
  const flatRows = rows.map(row => flattenObject(row));
  
  // Infer schema from first row
  const columns = Object.keys(flatRows[0]);
  const columnDefs = columns.map(col => `"${col}" VARCHAR`).join(', ');
  
  await db.exec(`CREATE TABLE dataset (${columnDefs})`);
  
  // Insert data
  const placeholders = columns.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT INTO dataset VALUES (${placeholders})`);
  
  for (const row of flatRows) {
    const values = columns.map(col => {
      const value = row[col];
      // Serialize objects/arrays as JSON strings
      return typeof value === 'object' ? JSON.stringify(value) : value;
    });
    stmt.run(...values);
  }
  
  return { tableName: 'dataset', rowCount: rows.length };
}

function flattenObject(obj: any, prefix = '', maxDepth = 2): any {
  if (maxDepth === 0) {
    // Reached max depth, serialize as JSON string
    return { [prefix]: JSON.stringify(obj) };
  }
  
  const result: any = {};
  
  for (const key in obj) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}_${key}` : key;
    
    if (value === null || value === undefined) {
      result[newKey] = null;
    } else if (Array.isArray(value)) {
      // Serialize arrays as JSON
      result[newKey] = JSON.stringify(value);
    } else if (typeof value === 'object') {
      // Recurse for nested objects (up to maxDepth)
      Object.assign(result, flattenObject(value, newKey, maxDepth - 1));
    } else {
      result[newKey] = value;
    }
  }
  
  return result;
}
```

### 5.2 JSON Format Examples

**Supported format 1: Array of objects**
```json
[
  { "id": 1, "name": "Alice", "age": 30 },
  { "id": 2, "name": "Bob", "age": 25 }
]
```

**Supported format 2: Newline-delimited JSON (NDJSON)**
```json
{"id": 1, "name": "Alice", "age": 30}
{"id": 2, "name": "Bob", "age": 25}
```

**Supported format 3: Nested objects (up to 2 levels)**
```json
[
  {
    "id": 1,
    "user": {
      "name": "Alice",
      "email": "alice@example.com"
    }
  }
]
```
Flattened to:
```
id | user_name | user_email
1  | Alice     | alice@example.com
```

**NOT supported: Deep nesting (> 2 levels)**
```json
{
  "level1": {
    "level2": {
      "level3": {
        "level4": "value"
      }
    }
  }
}
```
Result: `level1_level2` column contains `{"level3": {"level4": "value"}}` as JSON string.

## 6. Parquet Import (Phase 6)

### 6.1 Implementation Strategy

**Use DuckDB's native Parquet support (simplest and fastest):**

```typescript
// src/core/ingestion/importParquet.ts
import { Database } from 'duckdb';

export async function importParquet(
  db: Database,
  filePath: string
): Promise<{ tableName: string; rowCount: number }> {
  await db.exec('DROP TABLE IF EXISTS dataset');
  
  // DuckDB has built-in Parquet support
  const sql = `CREATE TABLE dataset AS SELECT * FROM read_parquet(?)`;
  await db.prepare(sql).run(filePath);
  
  const result = await db.prepare('SELECT COUNT(*) as count FROM dataset').get();
  
  return {
    tableName: 'dataset',
    rowCount: result.count
  };
}
```

**Why Parquet is ideal:**
- **Columnar format:** Perfect match for DuckDB's columnar engine
- **Compressed:** Smaller files than CSV (5-10x compression)
- **Typed:** Schema embedded in file (no type inference needed)
- **Fast:** Binary format, no parsing overhead

### 6.2 Parquet Use Cases

**Best for:**
- Large datasets exported from data warehouses (Snowflake, BigQuery, Redshift)
- Data engineering pipelines (Spark, Pandas)
- Interchange between analytics tools

**Not ideal for:**
- Manual data entry (use CSV or XLSX)
- Web APIs (use JSON)
- Quick ad-hoc analysis (CSV is more accessible)

## 7. Unified Import API

### 7.1 IPC Handler Registration

**Main process (`src/main/ipc/handlers.ts`):**

```typescript
import { ipcMain, dialog } from 'electron';
import { getConnection } from '../duckdb/connection';
import { importCsv } from '@core/ingestion/importCsv';
import { importXlsx } from '@core/ingestion/importXlsx';
import { importJson } from '@core/ingestion/importJson';
import { importParquet } from '@core/ingestion/importParquet';

export function registerImportHandlers() {
  // CSV import
  ipcMain.handle('import-csv', async (event, filePath: string) => {
    try {
      const db = getConnection();
      const result = await importCsv(db, filePath);
      
      // After import, run schema detection
      const schema = await detectSchema(db, result.tableName);
      const quality = await profileQuality(db, result.tableName, schema);
      
      return { ...result, schema, quality };
    } catch (error) {
      return { error: error.message };
    }
  });
  
  // XLSX import (Phase 6)
  ipcMain.handle('import-xlsx', async (event, filePath: string, sheetIndex?: number) => {
    try {
      const db = getConnection();
      const result = await importXlsx(db, filePath, { sheetIndex });
      const schema = await detectSchema(db, result.tableName);
      const quality = await profileQuality(db, result.tableName, schema);
      return { ...result, schema, quality };
    } catch (error) {
      return { error: error.message };
    }
  });
  
  // JSON import (Phase 6)
  ipcMain.handle('import-json', async (event, filePath: string) => {
    try {
      const db = getConnection();
      const result = await importJson(db, filePath);
      const schema = await detectSchema(db, result.tableName);
      const quality = await profileQuality(db, result.tableName, schema);
      return { ...result, schema, quality };
    } catch (error) {
      return { error: error.message };
    }
  });
  
  // Parquet import (Phase 6)
  ipcMain.handle('import-parquet', async (event, filePath: string) => {
    try {
      const db = getConnection();
      const result = await importParquet(db, filePath);
      const schema = await detectSchema(db, result.tableName);
      const quality = await profileQuality(db, result.tableName, schema);
      return { ...result, schema, quality };
    } catch (error) {
      return { error: error.message };
    }
  });
  
  // File picker (unified for all formats)
  ipcMain.handle('select-file', async (event, formats: string[]) => {
    const filters = formats.map(fmt => ({
      name: fmt.toUpperCase(),
      extensions: [fmt]
    }));
    
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters
    });
    
    if (result.canceled) {
      return { canceled: true };
    }
    
    return { filePath: result.filePaths[0] };
  });
}
```

### 7.2 Renderer API (Preload)

**Preload script (`src/preload.ts`):**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: (formats: string[]) => ipcRenderer.invoke('select-file', formats),
  importCsv: (filePath: string) => ipcRenderer.invoke('import-csv', filePath),
  importXlsx: (filePath: string, sheetIndex?: number) => 
    ipcRenderer.invoke('import-xlsx', filePath, sheetIndex),
  importJson: (filePath: string) => ipcRenderer.invoke('import-json', filePath),
  importParquet: (filePath: string) => ipcRenderer.invoke('import-parquet', filePath),
});
```

**TypeScript declarations (`src/types/electron.d.ts`):**

```typescript
interface ElectronAPI {
  selectFile: (formats: string[]) => Promise<{ filePath?: string; canceled?: boolean }>;
  importCsv: (filePath: string) => Promise<ImportResult>;
  importXlsx: (filePath: string, sheetIndex?: number) => Promise<ImportResult>;
  importJson: (filePath: string) => Promise<ImportResult>;
  importParquet: (filePath: string) => Promise<ImportResult>;
}

interface ImportResult {
  tableName?: string;
  rowCount?: number;
  schema?: Schema;
  quality?: QualityReport;
  error?: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

## 8. Progress Reporting

### 8.1 Current Approach (Phase 1-3)

**Simple loading state:**
- Show spinner while import in progress
- Block UI until complete
- No progress percentage (DuckDB doesn't provide progress callbacks)

**UI implementation:**
```tsx
// src/renderer/components/ImportPanel.tsx
const [isImporting, setIsImporting] = useState(false);

async function handleImport() {
  setIsImporting(true);
  try {
    const { filePath } = await window.electronAPI.selectFile(['csv']);
    if (!filePath) return;
    
    const result = await window.electronAPI.importCsv(filePath);
    
    if (result.error) {
      alert(result.error);
    } else {
      // Update state with imported data
      setDataset(result);
    }
  } finally {
    setIsImporting(false);
  }
}
```

### 8.2 Future Enhancement (Phase 6)

**Streaming progress (if feasible):**
- Estimate progress by file size
- Update UI every N seconds
- Requires background task architecture

## 9. Validation & Sanity Checks

### 9.1 Pre-Import Validation

**File system checks:**
- File exists
- File readable
- File size reasonable (< 500MB)
- File extension matches format

**Post-Import Validation:**
- Table created successfully
- Row count > 0
- Column count > 0
- At least one column with non-null values

### 9.2 Data Quality Warnings

**Show warnings (non-blocking) for:**
- > 50% missing values in any column
- All rows identical (duplicate detection)
- No numeric columns (limits analysis types)
- No date columns (limits time series)
- Single column only (limits correlations)

**Example warning UI:**
```
⚠️ Data Quality Issues Detected:
- Column "age": 30% missing values
- Column "id": All values identical
- No date columns found (time series analysis unavailable)

Continue anyway? [Yes] [Cancel]
```

## 10. Testing Strategy

### 10.1 Test Files

**Phase 1 test files (in `test-data/`):**
1. **students.csv** — Clean, well-formed, mixed types
2. **sales.csv** — Business data, dates, categories, numerics
3. **messy.csv** — Edge cases: nulls, mixed formats, high cardinality

**Phase 6 test files:**
4. **sales.xlsx** — Same as sales.csv but Excel format
5. **api_response.json** — Nested JSON (typical API export)
6. **data.parquet** — Parquet version of sales data

### 10.2 Test Cases

**CSV Import:**
- ✅ Well-formed CSV imports successfully
- ✅ Row count matches expected
- ✅ Column types detected correctly
- ❌ Malformed CSV shows error message
- ❌ File not found shows error
- ❌ Empty file shows error
- ❌ Non-UTF-8 encoding shows actionable error

**XLSX Import (Phase 6):**
- ✅ First sheet imported by default
- ✅ Numeric formatting preserved
- ✅ Date formatting preserved
- ❌ Empty sheet shows error
- ❌ Corrupted XLSX shows error

**JSON Import (Phase 6):**
- ✅ Array of objects imports correctly
- ✅ Nested objects flattened to 2 levels
- ✅ NDJSON format supported
- ❌ Invalid JSON shows parse error
- ❌ Non-array root shows error

**Parquet Import (Phase 6):**
- ✅ Standard Parquet imports correctly
- ✅ Schema preserved exactly
- ❌ Corrupted Parquet shows error

## 11. Document Status

- **Version:** 1.0  
- **Created:** 2026-09-08  
- **Covers:** File format support, import implementations, validation, error handling  
- **Related Docs:** DATABASE_DESIGN.md, SYSTEM_SPECIFICATION.md
