# Roadmap

## Phase Status

| Phase | Deliverable | Status |
|---|---|---|
| **1** | CSV import → DuckDB → schema detector → classified column table | ✅ Complete |
| **2** | Quality profiler (4 scores + issue list) + rule engine → applicable analysis list | ✅ Complete |
| **3** | First end-to-end: rule → SQL query → ECharts bar chart on screen | ✅ Complete |
| **4** | All 4 analysis types + all chart types (line, scatter, histogram, bar) | ✅ Complete |
| **5** | Insight generator with evidence-linked SQL on expand | ✅ Complete |
| **6** | XLSX/JSON/Parquet import, UI polish, `window.print()` PDF export, installer | ✅ Complete |
| **7** | Optional: Ollama local LLM — natural language → SQL → chart | 💡 Optional |

**Phases 1–3 = MVP (minimum viable proof of concept)**  
**Phases 1–6 = Complete product**

---

## Phase Dependency Order

```
Phase 1 (Foundation — CSV + DuckDB + Schema)
    │  ✅ Done
    ▼
Phase 2 (Quality + Rules)
    │  ✅ Done
    ▼
Phase 3 (First Analysis → Chart)  ◄── MVP milestone
    │
    ▼
Phase 4 (All Analytics + Charts)
    │
    ▼
Phase 5 (Insight Generator)
    │
    ▼
Phase 6 (Polish + Export + Packaging)  ◄── Complete product
    │
    ▼
Phase 7 (Optional AI layer — only if time permits)
```

Do not start a phase until the previous one's deliverable actually runs end-to-end.

---

## What's Been Delivered (Phases 1 & 2)

### Phase 1 ✅
- Electron + Vite + React + TS scaffold running
- DuckDB in-memory database initialized in main process
- `importCsv.ts` — `read_csv_auto()` with Windows path normalization
- `typeDetector.ts` — classifies columns into 6 types using cardinality heuristics
- IPC handlers for file selection + CSV import
- React UI: `ImportPanel`, `QualityCard`, `AnalysisList`, schema table

### Phase 2 ✅
- `qualityScore.ts` — 4-dimension scoring: completeness, uniqueness, validity, consistency
- Issue detection: missing values %, duplicate rows, outliers (IQR-based, zero-variance hardened)
- `ruleDefinitions.ts` — 4 analysis rules with schema-based conditions
- `ruleEngine.ts` — filters rules against schema, returns sorted applicable analysis list
- All 3 test datasets pass full pipeline including JSON serialization
- BigInt normalization in `connection.ts` (DuckDB → IPC safe)

---

## Implementation Rules

1. Don't start a phase until the previous one runs
2. `core/` never imports Electron or React
3. Every analysis = one parameterized DuckDB SQL query
4. No cloud APIs. No internet in core pipeline
5. Smallest working version at every step

---

## Detail Files

Phase task lists with done-criteria are in [`phases/`](phases/).
