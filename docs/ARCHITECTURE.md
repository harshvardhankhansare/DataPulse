# Architecture

## Process Split (Electron)

```
Main Process (Node.js)                    Renderer Process (React + TS)
────────────────────────────              ───────────────────────────────
duckdb (native node bindings)   ←─IPC─►  React components
file system access                        Zustand state
ipc/handlers.ts                           No direct DuckDB access
```

The renderer **never** touches DuckDB directly. All data flows through `ipcRenderer.invoke()`.

---

## Folder Structure (Current)

```
src/
├── main/                          # Electron main process
│   ├── index.ts                   # App entry, DuckDB init, Vite retry loop
│   ├── duckdb/
│   │   └── connection.ts          # DuckDB init, query(), BigInt normalizer
│   └── ipc/
│       └── handlers.ts            # IPC: select-csv-file, import-csv
│
├── core/                          # Pure TypeScript — no Electron, no React
│   ├── ingestion/
│   │   └── importCsv.ts           # read_csv_auto() + Windows path fix
│   ├── schema/
│   │   ├── schemaTypes.ts         # ColumnType, TableSchema, ColumnMetadata
│   │   └── typeDetector.ts        # Column classifier (6 types)
│   ├── profiler/
│   │   ├── profilerTypes.ts       # QualityReport, QualityIssue
│   │   └── qualityScore.ts        # 4-dim scoring + issue detection
│   └── rules/
│       ├── ruleTypes.ts           # AnalysisRule, AnalysisTask
│       ├── ruleDefinitions.ts     # 4 built-in rules
│       └── ruleEngine.ts          # Schema → applicable analyses
│
├── renderer/                      # React app
│   ├── App.tsx                    # Root layout, state wiring
│   ├── main.tsx                   # ReactDOM entry
│   ├── components/
│   │   ├── ImportPanel.tsx        # File select, import trigger
│   │   ├── QualityCard.tsx        # Quality score display
│   │   └── AnalysisList.tsx       # Applicable analyses list
│   └── styles/index.css           # Tailwind base
│
├── types/
│   └── electron.d.ts              # window.electron type declarations
└── preload.ts                     # contextBridge: selectCsvFile, importCsv
```

### Planned additions (Phases 3–6)

```
src/core/
├── analytics/
│   ├── descriptiveStats.ts        # Phase 4
│   ├── groupAggregation.ts        # Phase 3
│   ├── correlation.ts             # Phase 4
│   └── timeSeries.ts             # Phase 4
├── charts/
│   └── chartSelector.ts          # Phase 3 — maps result → ECharts config
└── insights/
    ├── insightTypes.ts            # Phase 5
    └── insightGenerator.ts       # Phase 5

src/renderer/components/
├── ChartGrid.tsx                  # Phase 3
├── InsightList.tsx                # Phase 5
├── SchemaTable.tsx               # Phase 4 (currently inline in App.tsx)
└── Dashboard.tsx                 # Phase 6
```

---

## Module Responsibilities

| Module | Input | Output | Rule |
|---|---|---|---|
| `importCsv` | File path | DuckDB table created | Normalize Windows `\` paths |
| `typeDetector` | Table name | `TableSchema` | Uses distinct ratio + DuckDB type |
| `qualityScore` | Table + schema | `QualityReport` | 4 scores + issues list |
| `ruleEngine` | `TableSchema` | `AnalysisTask[]` | Filter rules, sort by priority |
| `analytics/*` | Table + column names | Typed rows | Single parameterized SQL query each |
| `chartSelector` | Analysis result | ECharts option object | No pie charts, top-N for high cardinality |
| `insightGenerator` | Stat result | `{text, evidenceQuery, sourceColumns}` | Template-based, every claim citable |

---

## Key Rules

1. **`core/` is framework-free** — never imports from `main/` or `renderer/`. Data in, data out.
2. **DuckDB is the only analytics engine** — no lodash number-crunching, no in-JS aggregation.
3. **IPC payloads must be JSON-safe** — `connection.ts` normalizes `BigInt → number` and `Date → ISO string`.
4. **No cloud APIs** — all processing is local, all data stays on-device.
5. **Rule engine drives analysis selection** — no hardcoded "if CSV has dates, show time-series".

---

## IPC API (Main ↔ Renderer)

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `select-csv-file` | renderer → main | — | `string \| null` (file path) |
| `import-csv` | renderer → main | `filePath: string` | `{ success, schema?, quality?, applicableAnalyses?, error? }` |

Future phases will add channels for running specific analyses.
