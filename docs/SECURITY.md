# Security & Privacy

## 1. Overview

This document outlines the security and privacy architecture for the Offline Data Intelligence system, covering threat models, mitigation strategies, and user data protection.

## 2. Security Principles

### 2.1 Core Security Posture

**Primary Security Advantage: Offline-First**
- No network attack surface (no cloud APIs, no remote servers)
- All data processing happens locally
- User data never leaves their machine
- No authentication or authorization needed (single-user, local app)

**Defense in Depth:**
1. Input validation (file format, size, content)
2. SQL injection prevention (parameterized queries)
3. Renderer process sandboxing (Electron security model)
4. File system access restrictions (user-selected files only)

### 2.2 Threat Model

**In Scope:**
- Malicious CSV files (injection attacks, zip bombs)
- SQL injection via column names
- Arbitrary file system access
- XSS in renderer process (malicious data in UI)

**Out of Scope:**
- Network-based attacks (no network surface)
- Multi-user access control (single-user app)
- Cryptographic protection (no secrets stored)
- Supply chain attacks (standard npm audit process)

## 3. Input Validation

### 3.1 File Upload Security

**File Selection Method:**
```typescript
// SECURE: Use Electron dialog (user explicitly selects file)
const result = await dialog.showOpenDialog({
  properties: ['openFile'],
  filters: [{ name: 'CSV Files', extensions: ['csv'] }]
});

// INSECURE: Accept arbitrary file paths from renderer
// ❌ ipcMain.handle('import', (event, userProvidedPath) => { ... })
```

**File Validation Checks:**
```typescript
function validateImportFile(filePath: string, expectedExtension: string): void {
  // 1. File existence
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found');
  }
  
  // 2. File readability
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch {
    throw new Error('File not readable');
  }
  
  // 3. File size limit (prevent memory exhaustion)
  const stats = fs.statSync(filePath);
  const MAX_FILE_SIZE = 500 * 1024 * 1024;  // 500MB
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(0)}MB (max 500MB)`);
  }
  
  // 4. Extension check (basic, not security boundary)
  if (!filePath.toLowerCase().endsWith(expectedExtension)) {
    throw new Error(`Invalid file type (expected ${expectedExtension})`);
  }
  
  // 5. Path traversal prevention
  const resolvedPath = path.resolve(filePath);
  // Ensure resolved path is not in sensitive directories
  const forbiddenPaths = [
    path.resolve(os.homedir(), '.ssh'),
    path.resolve(os.homedir(), '.aws'),
    'C:\\Windows\\System32'
  ];
  
  for (const forbidden of forbiddenPaths) {
    if (resolvedPath.startsWith(forbidden)) {
      throw new Error('Access to this file is not allowed');
    }
  }
}
```

### 3.2 Content Validation

**CSV Bomb Prevention:**
```typescript
// Limit row count during parsing
const MAX_ROWS = 10_000_000;  // 10M rows
const MAX_COLUMNS = 1000;

// DuckDB read_csv_auto with limits
const sql = `
  SELECT * FROM read_csv_auto(?)
  LIMIT ${MAX_ROWS}
`;

// Check column count after import
const result = await db.prepare('DESCRIBE dataset').all();
if (result.length > MAX_COLUMNS) {
  throw new Error(`Too many columns: ${result.length} (max ${MAX_COLUMNS})`);
}
```

**Malicious Content Detection:**
```typescript
// Check for suspicious patterns in CSV headers
function validateColumnNames(columns: string[]): void {
  const suspiciousPatterns = [
    /<script>/i,           // HTML/JS injection
    /javascript:/i,        // JS protocol
    /on\w+=/i,            // Event handlers (onclick=, etc.)
    /\x00/,               // Null bytes
  ];
  
  for (const column of columns) {
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(column)) {
        throw new Error(`Suspicious column name detected: ${column}`);
      }
    }
  }
}
```

## 4. SQL Injection Prevention

### 4.1 The Threat

**Problem:** Column names come from CSV headers (user-controlled)

**Example Attack:**
```csv
name,age,"); DROP TABLE dataset; --
Alice,30,100
```

If naively inserted into SQL:
```sql
SELECT "name", "age", ""); DROP TABLE dataset; --" FROM dataset
-- This would execute the DROP command!
```

### 4.2 Mitigation Strategies

**1. Whitelist Validation:**
```typescript
function validateColumnName(columnName: string, schema: Schema): void {
  const validColumns = schema.columns.map(c => c.name);
  
  if (!validColumns.includes(columnName)) {
    throw new Error(`Column '${columnName}' does not exist in schema`);
  }
}

// Usage
const userRequestedColumn = params.numericColumn;
validateColumnName(userRequestedColumn, schema);

const sql = `SELECT "${userRequestedColumn}" FROM dataset`;
```

**2. Identifier Sanitization:**
```typescript
function sanitizeIdentifier(identifier: string): string {
  // Allow only alphanumeric, underscore, and spaces
  if (!/^[a-zA-Z0-9_ ]+$/.test(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}`);
  }
  
  return identifier;
}
```

**3. Use Double-Quoted Identifiers:**
```typescript
// DuckDB treats double-quoted strings as identifiers
// Prevents SQL injection via column names
const sql = `SELECT "${sanitizeIdentifier(columnName)}" FROM dataset`;
```

**4. Parameterized Queries (where possible):**
```typescript
// For values, use parameterized queries
const stmt = db.prepare('SELECT * FROM dataset WHERE "age" > ?');
const result = stmt.all(minAge);  // minAge is safely parameterized
```

### 4.3 Query Construction Rules

**Safe Pattern:**
```typescript
function buildAggregationQuery(
  categoricalColumn: string,
  numericColumn: string,
  schema: Schema
): string {
  // 1. Validate against schema
  validateColumnName(categoricalColumn, schema);
  validateColumnName(numericColumn, schema);
  
  // 2. Sanitize identifiers
  const safeCatCol = sanitizeIdentifier(categoricalColumn);
  const safeNumCol = sanitizeIdentifier(numericColumn);
  
  // 3. Use double-quoted identifiers
  return `
    SELECT "${safeCatCol}" as category, AVG("${safeNumCol}") as avg_value
    FROM dataset
    GROUP BY "${safeCatCol}"
    ORDER BY avg_value DESC
  `;
}
```

**Unsafe Pattern (NEVER DO THIS):**
```typescript
// ❌ VULNERABLE TO SQL INJECTION
function buildQueryUNSAFE(column: string): string {
  return `SELECT ${column} FROM dataset`;  // No validation, no quotes!
}
```

## 5. Renderer Process Security

### 5.1 Electron Security Model

**Context Isolation (Enabled):**
```typescript
// src/main/index.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,        // ✅ Isolate renderer from Node.js
    nodeIntegration: false,        // ✅ No Node.js in renderer
    sandbox: true                  // ✅ Sandbox renderer process
  }
});
```

**Exposed API (Preload Script):**
```typescript
// src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

// Only expose specific, safe APIs
contextBridge.exposeInMainWorld('electronAPI', {
  // Safe: takes no user input directly
  selectFile: (formats: string[]) => ipcRenderer.invoke('select-file', formats),
  
  // Safe: filePath comes from dialog, not user input
  importCsv: (filePath: string) => ipcRenderer.invoke('import-csv', filePath),
  
  // Potentially unsafe: user-provided question
  // Validation happens in main process
  queryNaturalLanguage: (question: string) => 
    ipcRenderer.invoke('query-natural-language', question)
});

// ❌ NEVER expose dangerous APIs:
// contextBridge.exposeInMainWorld('unsafeAPI', {
//   readFile: (path) => fs.readFileSync(path),  // Arbitrary file access!
//   exec: (cmd) => require('child_process').exec(cmd)  // Command execution!
// });
```

### 5.2 XSS Prevention

**Problem:** Imported data displayed in UI could contain malicious HTML/JS

**Example Malicious CSV:**
```csv
name,comment
Alice,<script>alert('XSS')</script>
Bob,<img src=x onerror="alert('XSS')">
```

**Mitigation: React Auto-Escaping**
```tsx
// React automatically escapes string content
function DataTable({ data }: { data: any[] }) {
  return (
    <table>
      {data.map((row, idx) => (
        <tr key={idx}>
          {Object.values(row).map((cell, cellIdx) => (
            <td key={cellIdx}>
              {cell}  {/* ✅ React escapes this automatically */}
            </td>
          ))}
        </tr>
      ))}
    </table>
  );
}
```

**Dangerous Pattern (NEVER DO THIS):**
```tsx
// ❌ VULNERABLE TO XSS
function UnsafeComponent({ content }: { content: string }) {
  return <div dangerouslySetInnerHTML={{ __html: content }} />;
}
```

**Safe Alternative (if HTML rendering needed):**
```tsx
import DOMPurify from 'dompurify';

function SafeHtmlComponent({ content }: { content: string }) {
  const sanitized = DOMPurify.sanitize(content);
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

## 6. File System Access

### 6.1 Principle of Least Privilege

**Read Access:**
- Only files user explicitly selects via Electron dialog
- No directory traversal
- No access to system files

**Write Access:**
- Report exports only to user-selected location
- No writes to arbitrary paths
- No modification of source files

**Implementation:**
```typescript
// Export report
ipcMain.handle('export-report', async (event, format: 'html' | 'pdf') => {
  // User chooses save location
  const result = await dialog.showSaveDialog({
    defaultPath: `report-${Date.now()}.${format}`,
    filters: [
      { name: format.toUpperCase(), extensions: [format] }
    ]
  });
  
  if (result.canceled) {
    return { canceled: true };
  }
  
  // Only write to user-selected path
  const htmlContent = generateReport();
  await fs.promises.writeFile(result.filePath, htmlContent);
  
  return { filePath: result.filePath };
});
```

### 6.2 Temporary File Handling

**If temporary files needed (e.g., for report generation):**
```typescript
import os from 'os';
import path from 'path';
import { v4 as uuid } from 'uuid';

function getTempFilePath(extension: string): string {
  const tempDir = os.tmpdir();
  const filename = `odi-${uuid()}.${extension}`;
  return path.join(tempDir, filename);
}

// Clean up after use
async function withTempFile<T>(
  extension: string,
  fn: (filePath: string) => Promise<T>
): Promise<T> {
  const tempPath = getTempFilePath(extension);
  try {
    return await fn(tempPath);
  } finally {
    // Always clean up
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      // Ignore errors (file may not exist)
    }
  }
}
```

## 7. Privacy Protection

### 7.1 Data Handling Principles

**No Data Collection:**
- No telemetry or analytics
- No error reporting to external services
- No usage statistics
- No crash reports sent externally

**Local-Only Processing:**
- All data remains on user's machine
- No cloud backups or sync
- No external API calls (except optional Phase 7 Ollama, which is also local)

**No Persistent Storage (by default):**
- Imported data exists only in memory (DuckDB `:memory:`)
- Closing app discards all data
- User must explicitly export reports

### 7.2 Sensitive Data Handling

**If dataset contains PII (names, emails, IDs):**
- Displayed in UI but never transmitted
- Not logged to console or files
- Cleared from memory on app close

**Column Type Detection:**
```typescript
// Detect potential PII columns
function isPotentialPII(columnName: string): boolean {
  const piiKeywords = [
    'email', 'phone', 'ssn', 'passport', 'address',
    'name', 'dob', 'birth', 'credit_card', 'password'
  ];
  
  const lowerName = columnName.toLowerCase();
  return piiKeywords.some(keyword => lowerName.includes(keyword));
}

// Warn user if PII detected (Phase 6)
if (schema.columns.some(col => isPotentialPII(col.name))) {
  showWarning('This dataset may contain personally identifiable information (PII). Ensure you have permission to process this data.');
}
```

### 7.3 Report Exports

**User Control:**
- User explicitly chooses what to export
- User chooses export location
- Exports are static (no embedded credentials or API keys)

**Export Contents (HTML report):**
- Dataset metadata (row count, column names)
- Aggregated statistics (no raw data unless user includes sample)
- Charts (static images or embedded ECharts configs)
- Insights text

**What's NOT exported:**
- Full raw dataset (unless explicitly requested)
- Temporary files or cache
- Application state

## 8. Dependency Security

### 8.1 Supply Chain Risk

**NPM Dependencies:**
- Use `npm audit` to check for vulnerabilities
- Pin dependency versions (no `^` or `~` ranges in production)
- Review dependency licenses
- Minimize dependency count (current: 6 core dependencies)

**Audit Process:**
```bash
# Check for known vulnerabilities
npm audit

# Fix automatically (test after!)
npm audit fix

# Review high/critical issues manually
npm audit --audit-level=high
```

### 8.2 Electron Security Updates

**Stay Updated:**
- Electron releases security patches regularly
- Update to latest stable version
- Check Electron security advisories: https://www.electronjs.org/docs/latest/tutorial/security

**Current Recommended Version:**
- Electron 33+ (as of 2026-09-08)
- Chromium 120+
- Node.js 20+

### 8.3 DuckDB Native Module

**Security Considerations:**
- DuckDB is compiled C++ (native binary)
- Trust boundary: we rely on DuckDB's security
- SQL injection prevention: our responsibility
- Memory safety: DuckDB's responsibility

**Mitigation:**
- Use official DuckDB npm package (not third-party builds)
- Verify package integrity (npm checks signatures)
- Stay updated with DuckDB releases

## 9. Testing Security

### 9.1 Security Test Cases

**SQL Injection Tests:**
```typescript
test('rejects malicious column name', () => {
  const maliciousColumn = '"; DROP TABLE dataset; --';
  
  expect(() => {
    validateColumnName(maliciousColumn, schema);
  }).toThrow();
});

test('sanitizes special characters in identifiers', () => {
  const weirdColumn = "age'; DELETE FROM dataset WHERE '1'='1";
  
  expect(() => {
    sanitizeIdentifier(weirdColumn);
  }).toThrow('Invalid identifier');
});
```

**File Validation Tests:**
```typescript
test('rejects oversized files', () => {
  const hugePath = '/tmp/500gb-file.csv';
  
  expect(() => {
    validateImportFile(hugePath, '.csv');
  }).toThrow('File too large');
});

test('prevents path traversal', () => {
  const traversalPath = '../../../etc/passwd';
  
  expect(() => {
    validateImportFile(traversalPath, '.csv');
  }).toThrow();
});
```

**XSS Tests:**
```typescript
test('React escapes HTML in table cells', () => {
  const maliciousData = [
    { name: '<script>alert("XSS")</script>' }
  ];
  
  const { container } = render(<DataTable data={maliciousData} />);
  
  // Script tag should be escaped as text, not executed
  expect(container.innerHTML).toContain('&lt;script&gt;');
  expect(container.querySelector('script')).toBeNull();
});
```

### 9.2 Security Checklist

**Pre-Release Security Review:**
- [ ] All IPC handlers validate inputs
- [ ] No direct Node.js access from renderer
- [ ] Context isolation enabled
- [ ] SQL queries use parameterized or validated identifiers
- [ ] File access limited to user-selected files
- [ ] No telemetry or external network calls
- [ ] Dependencies audited (`npm audit` clean)
- [ ] Electron version up-to-date
- [ ] Error messages don't leak sensitive info
- [ ] No secrets or credentials in code

## 10. Security Disclosures

### 10.1 Known Limitations

**Not Protected Against:**
1. **Physical access:** If attacker has access to user's machine, they can access any data
2. **Malicious OS:** If operating system is compromised, all bets are off
3. **Supply chain (transitive dependencies):** We audit direct dependencies, but can't guarantee all transitive deps are secure

**Acceptable Risks (Solo Academic Project):**
- No bug bounty program
- No dedicated security team
- No formal security audit
- No CVE tracking

### 10.2 Responsible Use

**User Responsibilities:**
- Ensure they have rights to analyze data they import
- Keep OS and antivirus updated
- Don't import untrusted files from unknown sources
- Export reports only to secure locations

**Developer Responsibilities:**
- Follow secure coding practices
- Keep dependencies updated
- Test security-critical code paths
- Document security assumptions

## 11. Incident Response

### 11.1 If Security Issue Found

**During Development:**
1. Document the issue (what, impact, affected code)
2. Patch immediately
3. Test the fix
4. Review similar code for same pattern
5. Add test case to prevent regression

**Post-Deployment (if applicable):**
1. Assess severity (CVSS scoring)
2. Patch immediately for high/critical
3. Release security update
4. Notify users (if contact available)

### 11.2 Security Contacts

**For Academic Project:**
- Report to project supervisor
- Document in project report
- Include in viva presentation (if security-related)

## 12. Document Status

- **Version:** 1.0  
- **Created:** 2026-09-08  
- **Covers:** Threat model, input validation, SQL injection prevention, renderer security, privacy protection  
- **Related Docs:** SYSTEM_SPECIFICATION.md, DATABASE_DESIGN.md, LOCAL_AI.md
