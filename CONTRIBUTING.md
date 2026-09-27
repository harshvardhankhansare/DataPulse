# Contributing to DataPulse

## Project Structure

```
src/
├── core/                  # Pure logic (no UI, no Electron)
│   ├── ai/                # Local AI query generation & validation
│   ├── analytics/         # Statistics, correlations, time-series
│   ├── charts/            # Chart config generation
│   ├── diagnostic/        # Problem Finder / root-cause engine
│   ├── ingestion/         # CSV, Excel, JSON, Parquet importers
│   ├── insights/          # Plain English insight generation
│   ├── lakehouse/         # Multi-file join detection
│   ├── privacy/           # PII detection & masking
│   ├── profiler/          # Data quality scoring
│   ├── reporting/         # Executive summary & HTML export
│   ├── rules/             # Analysis rule engine
│   ├── schema/            # Column type detection
│   └── simulation/        # What-If calculator
├── main/                  # Electron main process
│   ├── duckdb/            # Database connection
│   ├── ipc/               # IPC handlers (split by feature)
│   └── index.ts           # App entry point
├── renderer/              # React UI
│   ├── components/        # All UI components
│   ├── styles/            # CSS
│   └── App.tsx            # Main app shell
├── preload.ts             # Electron context bridge
└── types/                 # TypeScript type definitions
tests/                     # Automated tests (node:test)
```

## Before You Change Anything

```bash
npm run type-check    # Must show 0 errors
npm test              # All tests must pass
npm run build         # Must compile cleanly
```

## Adding a New Feature

1. Add core logic in `src/core/<feature>/`
2. Add IPC handler in `src/main/ipc/<feature>Handlers.ts`
3. Register it in `src/main/ipc/handlers.ts`
4. Add preload bridge in `src/preload.ts`
5. Add type definition in `src/types/electron.d.ts`
6. Add UI component in `src/renderer/components/`
7. Add tab entry in `src/renderer/App.tsx`
8. Write test in `tests/`
