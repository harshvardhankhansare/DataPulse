# Database Design

## 1. Overview

This document describes the data storage and query architecture using DuckDB as the embedded analytics database.

## 2. DuckDB Architecture

### 2.1 Why DuckDB?

**DuckDB is an embedded OLAP (Online Analytical Processing) database designed for analytics workloads:**

- **Embedded:** Runs in-process (no separate server), perfect for offline desktop apps
- **Columnar storage:** Optimized for analytical queries (aggregations, scans)
- **SQL interface:** Standard SQL with analytics extensions
- **Zero configuration:** No setup, no admin overhead
- **Fast:** C++ implementation, vectorized execution
- **Small footprint:** ~20MB library, minimal memory overhead

**Comparison to alternatives:**
- SQLite: Row-oriented (OLTP), slower for analytics
- PostgreSQL: Requires server, overkill for single-user
- Pandas: In-memory only, no SQL, slower for large data

### 2.2 Connection Model

```
Electron Main Process
    │
    ├─► DuckDB Connection (singleton)
    │       │
    │       ├─► In-memory database (`:memory:`)
    │       └─► Single connection instance
    │
    └─► IPC handlers call connection for queries
```

**Implementation (`src/main/duckdb/connection.ts`):**
```typescript
import Database from 'duckdb';

let dbInstance: Database | null = null;

export function getConnection(): Database {
  if (!dbInstance) {
    dbInstance = new Database(':memory:');  // In-memory mode
  }
  return dbInstance;
}

export function closeConnection(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
```

**Connection Lifecycle:**
- Created on first import
- Persists for entire app session
- Closed on app quit
- All data lost when connection closes (session-only)

### 2.3 Storage Mode

**Phase 1-6: In-Memory Only**
- Database: `:memory:`
- Data stored in RAM
- Fast but volatile
- Size limited by available RAM (~4GB practical limit on 8GB system)

**Future (out of scope): Persistent Mode**
- Database: file path (`./data.duckdb`)
- Data persists across sessions
- Slower but handles larger datasets
- Requires more complex lifecycle management

## 3. Table Schema

### 3.1 Dataset Table

**Table name:** `dataset` (fixed name, overwritten on each import)

**Schema:** Dynamic based on imported file

**Creation:**
```sql
CREATE TABLE dataset AS 
SELECT * FROM read_csv_auto('path/to/file.csv');
```

**DuckDB infers:**
- Column names from header row
- Column types from data inspection
- Delimiter, quote character, null representation

**Example schema for `students.csv`:**
```sql
CREATE TABLE dataset (
  student_id VARCHAR,
  name VARCHAR,
  age INTEGER,
  grade DOUBLE,
  enrolled BOOLEAN,
  enrollment_date DATE
);
```

### 3.2 Type Mapping

| CSV Content | DuckDB Inferred Type | Our Detected Type |
|-------------|---------------------|-------------------|
| `1, 2, 3` | `INTEGER` | `NUMERIC` |
| `1.5, 2.7, 3.2` | `DOUBLE` | `NUMERIC` |
| `"A", "B", "C"` (low distinct) | `VARCHAR` | `CATEGORICAL` |
| `"Text...", "Long..."` (high distinct) | `VARCHAR` | `TEXT` |
| `true, false` | `BOOLEAN` | `BOOLEAN` |
| `2024-01-15` | `DATE` | `DATE` |
| `2024-01-15 10:30:00` | `TIMESTAMP` | `DATETIME` |
| `UUID, email, ID` (unique) | `VARCHAR` | `IDENTIFIER` |

**Our type detection layer adds semantic meaning on top of DuckDB's SQL types.**

### 3.3 Metadata Table (Future)

**Currently:** No metadata storage

**Future enhancement:**
```sql
CREATE TABLE dataset_metadata (
  import_timestamp TIMESTAMP,
  source_file VARCHAR,
  row_count INTEGER,
  column_count INTEGER,
  quality_score DOUBLE
);
```

## 4. Query Patterns

### 4.1 Schema Inspection

**Get column names and types:**
```sql
DESCRIBE dataset;
-- Returns: column_name, column_type, null, key, default, extra
```

**Get row count:**
```sql
SELECT COUNT(*) FROM dataset;
```

**Get column statistics:**
```sql
SELECT 
  COUNT(DISTINCT column_name) as distinct_count,
  COUNT(*) - COUNT(column_name) as null_count,
  typeof(column_name) as inferred_type
FROM dataset;
```

**Get sample values:**
```sql
SELECT column_name 
FROM dataset 
WHERE column_name IS NOT NULL 
LIMIT 5;
```

### 4.2 Data Quality Queries

**Completeness (per column):**
```sql
SELECT 
  column_name,
  COUNT(*) as total,
  COUNT(column_name) as non_null,
  COUNT(column_name) * 1.0 / COUNT(*) as completeness
FROM dataset;
```

**Duplicate detection:**
```sql
SELECT COUNT(*) - COUNT(DISTINCT *) as duplicate_count
FROM dataset;
```

**Outlier detection (numeric):**
```sql
WITH stats AS (
  SELECT 
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY numeric_col) as q1,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY numeric_col) as q3
  FROM dataset
),
iqr AS (
  SELECT q1, q3, (q3 - q1) as iqr FROM stats
)
SELECT COUNT(*)
FROM dataset, iqr
WHERE numeric_col < (q1 - 3 * iqr) 
   OR numeric_col > (q3 + 3 * iqr);
```

### 4.3 Descriptive Statistics

**Single column stats:**
```sql
SELECT 
  COUNT(*) as count,
  COUNT(numeric_col) as non_null_count,
  AVG(numeric_col) as mean,
  MEDIAN(numeric_col) as median,
  STDDEV(numeric_col) as stddev,
  MIN(numeric_col) as min,
  MAX(numeric_col) as max,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY numeric_col) as q1,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY numeric_col) as q3
FROM dataset;
```

**Multi-column stats (pivot):**
```sql
UNPIVOT dataset
ON COLUMNS(numeric_col1, numeric_col2, numeric_col3)
INTO NAME column_name VALUE value;

-- Then aggregate per column_name
```

### 4.4 Group Aggregation

**Category-based aggregation:**
```sql
SELECT 
  categorical_col as category,
  AVG(numeric_col) as avg_value,
  SUM(numeric_col) as sum_value,
  COUNT(*) as count
FROM dataset
GROUP BY categorical_col
ORDER BY avg_value DESC
LIMIT 20;  -- Top 20 categories
```

**Multiple aggregations:**
```sql
SELECT 
  category,
  AVG(value) as avg,
  MIN(value) as min,
  MAX(value) as max,
  STDDEV(value) as stddev
FROM dataset
GROUP BY category;
```

### 4.5 Correlation Analysis

**Pearson correlation (pairwise):**
```sql
SELECT 
  CORR(numeric_col1, numeric_col2) as correlation
FROM dataset;
```

**Correlation matrix (multiple columns):**
```sql
-- Requires multiple queries for all pairs
SELECT 'col1' as column1, 'col2' as column2, CORR(col1, col2) as corr FROM dataset
UNION ALL
SELECT 'col1', 'col3', CORR(col1, col3) FROM dataset
UNION ALL
SELECT 'col2', 'col3', CORR(col2, col3) FROM dataset;
```

### 4.6 Time Series Analysis

**Temporal aggregation:**
```sql
SELECT 
  DATE_TRUNC('month', date_col) as period,
  AVG(numeric_col) as avg_value,
  SUM(numeric_col) as sum_value,
  COUNT(*) as count
FROM dataset
GROUP BY DATE_TRUNC('month', date_col)
ORDER BY period;
```

**Date granularity options:**
- `DATE_TRUNC('day', date_col)` — daily
- `DATE_TRUNC('week', date_col)` — weekly
- `DATE_TRUNC('month', date_col)` — monthly
- `DATE_TRUNC('quarter', date_col)` — quarterly
- `DATE_TRUNC('year', date_col)` — yearly

**Period-over-period comparison:**
```sql
WITH monthly AS (
  SELECT 
    DATE_TRUNC('month', date_col) as month,
    SUM(value) as total
  FROM dataset
  GROUP BY month
)
SELECT 
  month,
  total,
  LAG(total, 1) OVER (ORDER BY month) as prev_month,
  (total - LAG(total, 1) OVER (ORDER BY month)) * 100.0 / 
    LAG(total, 1) OVER (ORDER BY month) as percent_change
FROM monthly;
```

## 5. Query Safety

### 5.1 SQL Injection Prevention

**Problem:** User-controlled column names in SQL queries

**Bad (vulnerable):**
```typescript
const sql = `SELECT ${userColumn} FROM dataset`;  // ❌ SQL injection risk
db.query(sql);
```

**Good (safe):**
```typescript
// 1. Validate column name against schema
const validColumns = schema.columns.map(c => c.name);
if (!validColumns.includes(userColumn)) {
  throw new Error('Invalid column name');
}

// 2. Use parameterized identifier (DuckDB doesn't support this directly)
// Alternative: whitelist validation + template literal
const sql = `SELECT "${userColumn}" FROM dataset`;  // Quoted identifier

// 3. Best: use column index from schema
const columnIndex = validColumns.indexOf(userColumn);
const sql = `SELECT * FROM dataset`;
const result = db.query(sql);
const columnData = result.map(row => row[validColumns[columnIndex]]);
```

**Our approach:**
- Always validate column/table names against schema before using in SQL
- Use double-quoted identifiers for column names with special characters
- Never concatenate raw user input into SQL strings

### 5.2 Query Timeouts

**Problem:** Large datasets causing queries to hang

**Mitigation (Phase 6):**
```typescript
// Set statement timeout (DuckDB 0.10+)
db.exec('SET statement_timeout = 30000');  // 30 seconds

try {
  const result = db.query(sql);
} catch (error) {
  if (error.message.includes('timeout')) {
    throw new Error('Query took too long. Dataset may be too large.');
  }
  throw error;
}
```

### 5.3 Memory Management

**Problem:** Result sets larger than available RAM

**Current approach (Phase 1-6):**
- Load entire result into memory
- Risk: Out-of-memory errors on large aggregations

**Future optimization:**
- Streaming query results: `db.stream(sql)` (if DuckDB bindings support)
- Result pagination: `LIMIT/OFFSET` in queries
- Sampling: `SELECT * FROM dataset USING SAMPLE 10%`

## 6. Import Strategies

### 6.1 CSV Import

**Method 1: DuckDB native (preferred):**
```sql
CREATE TABLE dataset AS 
SELECT * FROM read_csv_auto('/path/to/file.csv');
```

**Advantages:**
- Automatic delimiter detection
- Automatic type inference
- Fast (C++ implementation)
- Handles quoted fields, escapes

**Options:**
```sql
SELECT * FROM read_csv_auto('file.csv', 
  delim = ',',
  header = true,
  sample_size = 20000,      -- Rows for type detection
  null_padding = true,       -- Handle irregular row lengths
  ignore_errors = false      -- Strict mode (fail on bad rows)
);
```

**Method 2: Manual via Node.js (fallback):**
```typescript
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const content = fs.readFileSync(filePath, 'utf-8');
const rows = parse(content, { columns: true });

// Insert into DuckDB
db.exec('CREATE TABLE dataset (col1 VARCHAR, col2 INTEGER, ...)');
const stmt = db.prepare('INSERT INTO dataset VALUES (?, ?, ...)');
rows.forEach(row => stmt.run(Object.values(row)));
```

### 6.2 XLSX Import (Phase 6)

**Process:**
1. Parse XLSX with SheetJS
2. Convert to JSON array
3. Insert into DuckDB

```typescript
import * as XLSX from 'xlsx';

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];  // First sheet
const worksheet = workbook.Sheets[sheetName];
const jsonData = XLSX.utils.sheet_to_json(worksheet);

// Create table from first row (headers)
const columns = Object.keys(jsonData[0]);
const columnDefs = columns.map(col => `"${col}" VARCHAR`).join(', ');
db.exec(`CREATE TABLE dataset (${columnDefs})`);

// Insert rows
const placeholders = columns.map(() => '?').join(', ');
const stmt = db.prepare(`INSERT INTO dataset VALUES (${placeholders})`);
jsonData.forEach(row => {
  stmt.run(columns.map(col => row[col]));
});
```

**Limitations:**
- First sheet only (or user-selected)
- No formula evaluation (values only)
- Large XLSX files slow (SheetJS is JavaScript, not native)

### 6.3 JSON Import (Phase 6)

**Method 1: DuckDB native (preferred):**
```sql
CREATE TABLE dataset AS 
SELECT * FROM read_json_auto('/path/to/file.json');
```

**Supported formats:**
- Array of objects: `[{col1: val1, col2: val2}, ...]`
- Newline-delimited JSON: `{col1: val1}\n{col1: val2}\n...`

**Method 2: Manual (for nested JSON):**
```typescript
const content = fs.readFileSync(filePath, 'utf-8');
const data = JSON.parse(content);

// Flatten nested objects (1-2 levels)
const flattened = data.map(row => flattenObject(row));

// Insert into DuckDB
```

**Flattening strategy:**
```typescript
function flattenObject(obj: any, prefix = ''): any {
  const result: any = {};
  for (const key in obj) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}_${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));  // Recurse 1 level
    } else {
      result[newKey] = value;
    }
  }
  return result;
}
```

### 6.4 Parquet Import (Phase 6)

**Method: DuckDB native (only option):**
```sql
CREATE TABLE dataset AS 
SELECT * FROM read_parquet('/path/to/file.parquet');
```

**Advantages:**
- Fastest import (columnar format, already compressed)
- No parsing overhead (binary format)
- Preserves types (no inference needed)

**Parquet is ideal for:**
- Large datasets exported from other analytics tools
- Pre-processed data from data engineering pipelines
- Interchange format between DuckDB instances

## 7. Performance Tuning

### 7.1 Query Optimization

**Use column projection (don't SELECT *):**
```sql
-- Bad
SELECT * FROM dataset WHERE category = 'A';

-- Good
SELECT id, name, value FROM dataset WHERE category = 'A';
```

**Use appropriate indexes (future):**
```sql
-- DuckDB doesn't support explicit indexes (as of v0.10)
-- Relies on automatic statistics and zone maps
```

**Limit result size:**
```sql
SELECT * FROM dataset LIMIT 1000;  -- Preview only
```

### 7.2 Memory Settings

**Configure DuckDB memory limit (future):**
```sql
SET memory_limit = '4GB';
SET max_memory = '4GB';
```

**Current approach:**
- Use system defaults
- Let DuckDB manage memory automatically

### 7.3 Import Optimization

**CSV:**
- Use `read_csv_auto()` (fastest, native C++)
- Avoid reading entire file into Node.js first

**XLSX:**
- Bottleneck is SheetJS (JavaScript parsing)
- Consider warning user for files > 10MB

**Parquet:**
- Already optimized (binary columnar format)

## 8. Data Type Handling

### 8.1 NULL Handling

**DuckDB NULL semantics:**
- SQL standard: `NULL != NULL` (use `IS NULL` checks)
- Aggregate functions skip NULLs: `AVG(col)` ignores NULL values
- `COALESCE(col, default)` for default values

**Our quality profiling:**
```sql
SELECT 
  COUNT(*) as total_rows,
  COUNT(column) as non_null_rows,
  COUNT(*) - COUNT(column) as null_rows,
  COUNT(column) * 100.0 / COUNT(*) as completeness_pct
FROM dataset;
```

### 8.2 Date/Time Handling

**Supported formats (auto-detected by DuckDB):**
- ISO 8601: `2024-01-15`, `2024-01-15T10:30:00`
- US format: `01/15/2024`, `1/15/24`
- European format: `15-01-2024`, `15.01.2024`

**Parsing ambiguity:**
- `01/02/2024` — is this Jan 2 or Feb 1?
- DuckDB assumes `MM/DD/YYYY` by default
- Phase 1-6: no manual override (rely on heuristics)

**Date functions:**
- `DATE_TRUNC(unit, date)` — truncate to granularity
- `DATE_PART(part, date)` — extract year, month, day, etc.
- `DATE_DIFF(unit, date1, date2)` — difference between dates

### 8.3 String Handling

**Case sensitivity:**
- Column names: case-insensitive by default (quoted for exact match)
- String values: case-sensitive in comparisons

**Pattern matching:**
- `LIKE`: `WHERE name LIKE 'A%'` (A followed by anything)
- `ILIKE`: Case-insensitive LIKE
- `REGEXP`: `WHERE name REGEXP '^[A-Z]+$'`

### 8.4 Boolean Handling

**Supported representations:**
- SQL standard: `true`, `false`
- Numeric: `1`, `0`
- Text: `'yes'`, `'no'`, `'t'`, `'f'`, `'Y'`, `'N'`

**Normalization:**
```sql
SELECT 
  CASE 
    WHEN bool_col IN (true, 1, 'yes', 'Y', 't') THEN true
    WHEN bool_col IN (false, 0, 'no', 'N', 'f') THEN false
    ELSE NULL
  END as normalized_bool
FROM dataset;
```

## 9. Backup & Recovery

### 9.1 Current Approach (Phase 1-6)

**No backup:**
- In-memory database only
- Data lost on app close
- Source file is the authoritative copy

**User responsibility:**
- Keep original files
- Re-import if analysis needed again

### 9.2 Future Enhancement

**Export DuckDB database:**
```sql
EXPORT DATABASE '/path/to/backup' (FORMAT PARQUET);
```

**Import database:**
```sql
IMPORT DATABASE '/path/to/backup';
```

**Incremental snapshots:**
- Save DuckDB file to disk periodically
- Reload from file on app start

## 10. Limitations & Known Issues

### 10.1 Current Limitations

1. **Single dataset per session:**
   - Only one `dataset` table at a time
   - No multi-dataset joins or comparisons

2. **In-memory only:**
   - Size limited by RAM (~4GB practical)
   - No persistence across sessions

3. **No schema evolution:**
   - Cannot add/remove columns after import
   - Cannot change column types

4. **No transactions:**
   - Not needed (read-only after import)
   - All queries are auto-commit

5. **No concurrent access:**
   - Single connection in main process
   - No multi-threaded queries (Electron is single-threaded)

### 10.2 DuckDB Version

**Target version:** 1.0+ (stable API)

**Node.js bindings:** `duckdb` npm package

**Breaking changes:**
- DuckDB < 1.0 had frequent API changes
- Stick to stable release for production

## 11. Document Status

- **Version:** 1.0  
- **Created:** 2026-09-08  
- **Covers:** DuckDB architecture, table schema, query patterns, import strategies, safety considerations  
- **Related Docs:** SYSTEM_SPECIFICATION.md, DATA_INGESTION.md
