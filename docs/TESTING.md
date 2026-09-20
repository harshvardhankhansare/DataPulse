# Testing Strategy

## 1. Overview

This document defines the testing approach for the Offline Data Intelligence system, covering unit tests, integration tests, end-to-end tests, and manual testing procedures.

## 2. Testing Philosophy

### 2.1 Core Principles

**Test What Matters:**
- Core analytics logic (most critical)
- Data quality profiling (affects user decisions)
- SQL query generation (security + correctness)
- File import (entry point for issues)

**Don't Over-Test:**
- UI styling/layout (visual inspection sufficient)
- Third-party libraries (trust ECharts, DuckDB, React)
- Electron framework internals

**Test Pyramid:**
```
        /\
       /E2E\        Few: Full app flows (import → dashboard)
      /------\
     /  Integ \     Some: IPC handlers, module integration
    /----------\
   /    Unit    \   Many: Core functions, pure logic
  /--------------\
```

### 2.2 Testing Constraints

**Solo Project, Limited Time:**
- Focus on high-value tests
- Automate what's easy to automate
- Manual testing for UI/UX
- No continuous integration (CI) initially

**Acceptable Trade-offs:**
- < 80% code coverage is okay
- No performance benchmarks (manual observation)
- No cross-platform testing (Windows only)
- No accessibility testing tools (manual checks)

## 3. Test Categories

### 3.1 Unit Tests

**Scope:** Pure TypeScript functions in `src/core/`

**Framework:** Jest + ts-jest

**What to Test:**
- Schema type detector logic
- Quality score calculations
- Rule engine filtering
- Analytics query builders
- Chart config generators
- Insight template functions

**Example Test:**
```typescript
// tests/unit/schema/typeDetector.test.ts
import { classifyColumnType } from '@core/schema/typeDetector';

describe('classifyColumnType', () => {
  test('identifies numeric column', () => {
    const result = classifyColumnType({
      distinctRatio: 0.8,
      distinctCount: 100,
      duckdbType: 'INTEGER',
      sampleValues: [1, 2, 3, 4, 5]
    });
    
    expect(result).toBe('NUMERIC');
  });
  
  test('identifies categorical column', () => {
    const result = classifyColumnType({
      distinctRatio: 0.05,
      distinctCount: 5,
      duckdbType: 'VARCHAR',
      sampleValues: ['A', 'B', 'C', 'A', 'B']
    });
    
    expect(result).toBe('CATEGORICAL');
  });
  
  test('identifies identifier column', () => {
    const result = classifyColumnType({
      distinctRatio: 0.99,
      distinctCount: 999,
      duckdbType: 'VARCHAR',
      sampleValues: ['ID001', 'ID002', 'ID003']
    });
    
    expect(result).toBe('IDENTIFIER');
  });
});
```

**Test Data:**
- Mock schema objects
- Synthetic data arrays
- No real DuckDB connection needed

### 3.2 Integration Tests

**Scope:** Module interactions, IPC handlers, DuckDB queries

**Framework:** Jest with in-memory DuckDB

**What to Test:**
- CSV import → schema detection
- Schema + rules → analysis selection
- Analysis execution → chart generation
- Full pipeline (import → insights)

**Example Test:**
```typescript
// tests/integration/pipeline.test.ts
import Database from 'duckdb';
import { importCsv } from '@core/ingestion/importCsv';
import { detectSchema } from '@core/schema/typeDetector';
import { profileQuality } from '@core/profiler/qualityScore';

describe('Import Pipeline', () => {
  let db: Database;
  
  beforeEach(() => {
    db = new Database(':memory:');
  });
  
  afterEach(() => {
    db.close();
  });
  
  test('imports CSV and detects schema correctly', async () => {
    // Import test CSV
    const result = await importCsv(db, './test-data/students.csv');
    expect(result.rowCount).toBeGreaterThan(0);
    
    // Detect schema
    const schema = await detectSchema(db, result.tableName);
    expect(schema.columns).toHaveLength(6);
    
    // Verify column types
    const ageColumn = schema.columns.find(c => c.name === 'age');
    expect(ageColumn?.detectedType).toBe('NUMERIC');
    
    const nameColumn = schema.columns.find(c => c.name === 'name');
    expect(nameColumn?.detectedType).toBe('TEXT');
  });
  
  test('profiles data quality', async () => {
    await importCsv(db, './test-data/messy.csv');
    const schema = await detectSchema(db, 'dataset');
    
    const quality = await profileQuality(db, 'dataset', schema);
    
    expect(quality.overallScore).toBeGreaterThan(0);
    expect(quality.overallScore).toBeLessThanOrEqual(1);
    expect(quality.issues).toBeInstanceOf(Array);
  });
});
```

### 3.3 End-to-End Tests

**Scope:** Full application flows via Electron

**Framework:** Playwright (Electron support) or manual testing

**What to Test:**
- Launch app
- Click "Import CSV" → file dialog → import → dashboard renders
- Verify charts displayed
- Verify insights list populated
- Export report
- Close app

**Example Test (Playwright):**
```typescript
// tests/e2e/import-flow.spec.ts
import { test, expect, _electron as electron } from '@playwright/test';

test('full import to dashboard flow', async () => {
  // Launch Electron app
  const app = await electron.launch({ args: ['dist/main/index.js'] });
  const window = await app.firstWindow();
  
  // Click import button
  await window.click('[data-testid="import-button"]');
  
  // Mock file dialog (Playwright limitation: can't interact with native dialogs)
  // In practice, we'd set dialog result programmatically
  
  // Wait for dashboard to render
  await window.waitForSelector('[data-testid="chart-grid"]', { timeout: 10000 });
  
  // Verify charts rendered
  const charts = await window.locator('[data-testid="chart"]').count();
  expect(charts).toBeGreaterThan(0);
  
  // Verify insights displayed
  const insights = await window.locator('[data-testid="insight"]').count();
  expect(insights).toBeGreaterThan(0);
  
  // Screenshot for manual review
  await window.screenshot({ path: 'test-results/dashboard.png' });
  
  await app.close();
});
```

**E2E Testing Challenges:**
- File dialogs can't be automated easily (require mocking or manual steps)
- Slower than unit tests
- Harder to debug failures
- **Solution:** Focus on integration tests, reserve E2E for critical flows only

### 3.4 Manual Testing

**Scope:** UI/UX, visual correctness, edge cases

**When:**
- Before each phase completion
- Before final demo/viva
- When automated tests insufficient

**Test Checklist (Phase 1):**
- [ ] App launches without errors
- [ ] Import button visible
- [ ] File dialog opens (CSV filter applied)
- [ ] students.csv imports successfully
- [ ] Schema table displays 6 columns
- [ ] Column types match expected (see README)
- [ ] No console errors
- [ ] App closes cleanly

**Test Checklist (Phase 2-3):**
- [ ] Quality score displays (0-100%)
- [ ] Quality issues listed (if present)
- [ ] At least one chart renders
- [ ] Chart displays correct data
- [ ] Chart is interactive (hover, zoom)
- [ ] No layout issues

**Test Checklist (Phase 4-6):**
- [ ] All analysis types work
- [ ] Multiple charts displayed
- [ ] Insights list populated
- [ ] "View Calculation" shows SQL
- [ ] Export report works (HTML/PDF)
- [ ] XLSX/JSON/Parquet imports work

## 4. Test Data

### 4.1 Test Datasets (in `test-data/`)

**1. students.csv (Clean, Well-Formed)**
```csv
student_id,name,age,grade,enrolled,enrollment_date
S001,Alice,20,3.8,true,2023-09-01
S002,Bob,22,3.2,true,2023-09-01
S003,Charlie,19,3.9,false,2023-09-15
...
```
- **Purpose:** Happy path testing
- **Expected:** All columns detected correctly, no quality issues
- **Analysis:** Descriptive stats (age, grade), group aggregation (enrolled counts)

**2. sales.csv (Business Data with Categories)**
```csv
sale_id,product,quantity,price,region,sale_date
1,Laptop,1,999.99,North,2024-01-15
2,Mouse,5,19.99,South,2024-01-16
3,Keyboard,2,59.99,North,2024-01-17
...
```
- **Purpose:** Test categorical + numeric + date columns
- **Expected:** Group aggregation (region/product), time series (date trends)

**3. messy.csv (Edge Cases)**
```csv
id,name,age,score,notes
1,Alice,,85,Good student
2,Bob,25,,
3,,30,92,
,Charlie,,,Missing everything
1,Alice,25,85,Duplicate row
4,Dave,999,150,Outliers
```
- **Purpose:** Data quality issues
- **Expected:** Low quality score, issues detected (missing values, duplicates, outliers)

**4. Phase 6 Additional Files:**
- `sales.xlsx` — Same as sales.csv, Excel format
- `api_response.json` — Nested JSON (typical API export)
- `data.parquet` — Parquet version of sales data

### 4.2 Synthetic Test Data Generation

**For large-scale testing:**
```typescript
// tests/utils/generateTestData.ts
export function generateLargeDataset(rows: number): any[] {
  const data = [];
  for (let i = 0; i < rows; i++) {
    data.push({
      id: i,
      category: `Cat${i % 10}`,
      value: Math.random() * 1000,
      date: new Date(2024, 0, (i % 365) + 1).toISOString().split('T')[0]
    });
  }
  return data;
}

// Write to CSV
function writeCsv(data: any[], path: string): void {
  const header = Object.keys(data[0]).join(',');
  const rows = data.map(row => Object.values(row).join(','));
  fs.writeFileSync(path, [header, ...rows].join('\n'));
}

// Usage
const largeDataset = generateLargeDataset(100_000);
writeCsv(largeDataset, './test-data/large.csv');
```

## 5. Test Configuration

### 5.1 Jest Configuration

**jest.config.js:**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@/(.*)$': '<rootDir>/src/renderer/$1'
  },
  collectCoverageFrom: [
    'src/core/**/*.ts',
    '!src/core/**/*.d.ts',
    '!src/core/**/*.types.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
};
```

### 5.2 NPM Scripts

**package.json:**
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "playwright test"
  }
}
```

## 6. Continuous Testing (Future)

### 6.1 Pre-Commit Hooks (Phase 6)

**husky + lint-staged:**
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "jest --bail --findRelatedTests"
    ]
  }
}
```

### 6.2 CI/CD (Out of Scope for Phase 1-6)

**GitHub Actions Example (future):**
```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '20'
      - run: npm install
      - run: npm run test:coverage
      - run: npm run build
```

## 7. Performance Testing

### 7.1 Manual Performance Checks

**No automated benchmarks, but verify:**
- CSV import (100K rows): < 5 seconds
- Schema detection (50 cols): < 10 seconds
- Analytics query: < 5 seconds each
- Chart render: < 2 seconds
- Dashboard load (5 charts): < 15 seconds

**How to Test:**
```typescript
// Add timing logs in development
console.time('import');
await importCsv(db, filePath);
console.timeEnd('import');  // Logs: import: 2.4s
```

### 7.2 Memory Testing

**Check for memory leaks:**
```bash
# Launch app with Node.js memory profiling
npm run dev -- --inspect

# Open chrome://inspect
# Take heap snapshots before/after import
# Compare snapshots for leaks
```

## 8. Regression Testing

### 8.1 Regression Test Suite

**After each phase, lock in tests for:**
- Phase 1: CSV import + schema detection
- Phase 2: Quality profiling + rule engine
- Phase 3: First analysis → chart
- Phase 4: All analyses
- Phase 5: Insights generation
- Phase 6: XLSX/JSON/Parquet + export

**Don't break previous phases when adding new features**

### 8.2 Golden Files (Reference Outputs)

**Store expected outputs:**
```
tests/golden/
├── students-schema.json       # Expected schema for students.csv
├── sales-quality.json         # Expected quality report
├── students-insights.json     # Expected insights
└── charts-config.json         # Expected chart configs
```

**Test against golden files:**
```typescript
test('schema detection matches golden file', async () => {
  const schema = await detectSchema(db, 'dataset');
  const golden = JSON.parse(fs.readFileSync('./tests/golden/students-schema.json', 'utf-8'));
  
  expect(schema).toMatchObject(golden);
});
```

## 9. Testing Checklist by Phase

### 9.1 Phase 1 Testing
- [x] Unit: Type detector classifies all column types
- [x] Integration: CSV import creates table
- [x] Integration: Schema detection queries work
- [x] Manual: students.csv, sales.csv, messy.csv all import
- [x] Manual: UI displays schema table correctly

### 9.2 Phase 2 Testing
- [ ] Unit: Quality score calculations
- [ ] Unit: Rule engine filters rules correctly
- [ ] Integration: Quality profiling detects issues
- [ ] Manual: Quality card displays on UI
- [ ] Manual: Different datasets produce different rule outputs

### 9.3 Phase 3 Testing
- [ ] Integration: Rule → SQL → result pipeline
- [ ] Unit: Chart selector maps results to configs
- [ ] Integration: ECharts renders from config
- [ ] Manual: Bar chart displays on screen
- [ ] Manual: Chart is interactive (hover, zoom)

### 9.4 Phase 4 Testing
- [ ] Integration: All 4 analysis types execute
- [ ] Unit: All chart types generate valid configs
- [ ] Manual: Multiple charts render simultaneously
- [ ] Manual: No performance issues with 5+ charts

### 9.5 Phase 5 Testing
- [ ] Unit: Insight templates generate correct text
- [ ] Integration: Insights link to correct SQL queries
- [ ] Manual: "View Calculation" shows valid SQL
- [ ] Manual: Insight text is readable and accurate

### 9.6 Phase 6 Testing
- [ ] Integration: XLSX import works
- [ ] Integration: JSON import works
- [ ] Integration: Parquet import works
- [ ] Manual: Report export (HTML/PDF) works
- [ ] Manual: Packaged app installs and runs

### 9.7 Phase 7 Testing (Optional)
- [ ] Integration: Ollama client connects
- [ ] Unit: SQL validator rejects dangerous queries
- [ ] Integration: Natural language → SQL → result
- [ ] Manual: App works with Ollama disabled

## 10. Bug Tracking

### 10.1 Simple Bug Log (agent-progress.md)

**Format:**
```markdown
## Bugs Found

### [Bug #1] Schema detection fails on empty CSV
- **Found:** 2026-09-08, Phase 1 testing
- **Severity:** High
- **Status:** Fixed
- **Fix:** Added empty file check in importCsv.ts

### [Bug #2] Chart render fails with single data point
- **Found:** 2026-09-10, Phase 3 testing
- **Severity:** Medium
- **Status:** Fixed
- **Fix:** Added minimum data point check in chartSelector.ts
```

### 10.2 No Formal Bug Tracker

**Acceptable for solo academic project:**
- Use comments in code for known issues
- Document in agent-progress.md
- Prioritize by impact (high = blocks demo, low = nice-to-fix)

## 11. Test Maintenance

### 11.1 Keep Tests Up-to-Date

**When code changes:**
- Update affected tests immediately
- Don't commit broken tests
- If test is obsolete, delete it

### 11.2 Test Code Quality

**Tests should be:**
- Readable (clear intent)
- Fast (< 1 second per test)
- Isolated (no dependencies between tests)
- Deterministic (same input = same output)

## 12. Document Status

- **Version:** 1.0  
- **Created:** 2026-09-08  
- **Covers:** Testing strategy, test types, test data, phase-specific checklists  
- **Related Docs:** DEVELOPMENT_WORKFLOW.md, PROJECT_REQUIREMENTS.md
