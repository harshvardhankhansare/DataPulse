# DataPulse — Known Risks & Maintenance Guide

> This document helps ANY developer (or AI agent) understand the risks, what's been fixed, and what to watch out for. Written in plain English.

---

## ✅ Risks That Have Been Fixed

### 1. Monolithic `handlers.ts` (540+ lines in one file)
- **Problem**: Every backend IPC handler was crammed into a single file. Hard to navigate, easy to introduce merge conflicts.
- **Fix Applied**: Split into 8 focused handler files:
  - `analyticsHandlers.ts` — Chart & statistics queries
  - `aiHandlers.ts` — Local AI / LLM integration
  - `simulationHandlers.ts` — What-If calculator
  - `privacyHandlers.ts` — PII scanning & masking
  - `diagnosticHandlers.ts` — Problem Finder engine
  - `reportingHandlers.ts` — Summary report generation & PDF/HTML export
  - `lakehouseHandlers.ts` — Multi-file joins
  - `editorHandlers.ts` — Cell editing, row deletion, cleaning, CSV export
- **Status**: ✅ Fixed

### 2. Zero Automated Tests
- **Problem**: No unit tests existed. Changes to core math (statistics, correlations, quality scoring) could silently break without anyone noticing.
- **Fix Applied**: Added automated test suite using Node.js built-in test runner (zero extra dependencies):
  - `tests/core-math.test.mjs` — Tests rule engine, SQL validator, prompt builder
  - `tests/schema-detection.test.mjs` — Tests column type detection against real DuckDB
  - `tests/quality-score.test.mjs` — Tests quality scoring with known null/duplicate data
- **How to run**: `npm test`
- **Status**: ✅ Fixed

### 3. `electron-builder` Security Advisory
- **Problem**: `npm audit` flagged `electron-builder@25.x` with a high-severity advisory related to AppImage search paths.
- **Impact**: This ONLY affects the packaging/installer tool, NOT the running application. Users of the desktop app are NOT vulnerable.
- **Fix Applied**: Updated to latest `electron-builder` that resolves the advisory.
- **Status**: ✅ Fixed

---

## 🟡 Known Limitations (Low Risk, Not Urgent)

### 4. Bundle Size Warning (1.4 MB JS)
- **What**: Vite warns that the renderer JS bundle is ~1.4 MB after minification.
- **Why**: Apache ECharts is a large charting library (~800 KB alone).
- **Impact**: On a desktop Electron app, this is irrelevant — the file loads from local disk in <100ms, not over the internet.
- **Fix if needed**: Use `manualChunks` in `vite.config.ts` to split ECharts into a lazy-loaded chunk. Not urgent.

### 5. No End-to-End (E2E) Tests
- **What**: We have unit tests for core logic, but no automated tests that launch the full Electron app and simulate user clicks.
- **Impact**: UI regressions (layout broken, button not responding) won't be caught automatically.
- **Fix if needed**: Add Playwright or Spectron E2E tests in the future.

### 6. Single Table Name Assumption
- **What**: The main import flow always uses the table name `imported_data`. If a user imports a second file, the first table is dropped.
- **Impact**: This is by design for single-dataset analysis. The Lakehouse mode handles multi-table scenarios separately.
- **Fix if needed**: Use unique table names per import session if multi-dataset mode becomes default.

---

## 🟢 Architecture Strengths (Why This Won't Collapse)

1. **TypeScript strict mode** — Every file is type-checked. The compiler catches broken code before it runs.
2. **Modular folder structure** — `core/` has zero UI dependencies. `renderer/` has zero Node.js dependencies. Clean separation.
3. **Only 20 direct dependencies** — Projects break when they have 200+ packages. DataPulse is lean.
4. **DuckDB is embedded** — No external database server to crash, disconnect, or configure. It's compiled into the app.
5. **No cloud dependency** — No API keys to expire, no servers to go down, no network timeouts.

---

## 🔧 Commands Reference

| Command | What It Does |
| :--- | :--- |
| `npm start` | Launch the desktop app |
| `npm run dev` | Development mode with hot-reload |
| `npm run build` | Compile TypeScript + bundle UI for production |
| `npm run type-check` | Verify all types are correct (0 errors = safe) |
| `npm test` | Run all automated tests |
| `npm audit` | Check for security vulnerabilities in dependencies |

---

## 📋 Pre-Change Checklist (For Any Future Developer or Agent)

Before making changes to DataPulse, always:

1. **Run `npm run type-check`** — Must show 0 errors
2. **Run `npm test`** — All tests must pass
3. **Run `npm run build`** — Must compile without failure
4. **Test the feature manually** — Launch with `npm start` and verify the UI works
5. **Commit with a meaningful message** — e.g., `fix: correct median calculation in descriptiveStats`
