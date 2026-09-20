# Documentation Index

**Project:** Offline Adaptive Data Intelligence & Analytics System  
**Stack:** Electron + React/TS + DuckDB + ECharts + Tailwind

---

## Quick Navigation

### For Development
| File | Purpose |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Module layout, data flow, key rules |
| [`ROADMAP.md`](ROADMAP.md) | Phase-by-phase build plan with statuses |
| [`DEVELOPMENT_WORKFLOW.md`](DEVELOPMENT_WORKFLOW.md) | How to start/end a session |

### Per-Phase Task Lists
| File | Phase | Status |
|---|---|---|
| [`phases/phase-1-ingestion-schema.md`](phases/phase-1-ingestion-schema.md) | CSV import + schema detection | ✅ Complete |
| [`phases/phase-2-profiler-rules.md`](phases/phase-2-profiler-rules.md) | Quality profiler + rule engine | ✅ Complete |
| [`phases/phase-3-first-analysis-to-chart.md`](phases/phase-3-first-analysis-to-chart.md) | First analysis → chart | 🔲 Next |
| [`phases/phase-4-full-analytics.md`](phases/phase-4-full-analytics.md) | All analysis types + charts | 🔲 Planned |
| [`phases/phase-5-insights.md`](phases/phase-5-insights.md) | Evidence-backed insight generator | 🔲 Planned |
| [`phases/phase-6-polish-export.md`](phases/phase-6-polish-export.md) | More formats + UI polish + PDF export | 🔲 Planned |
| [`phases/phase-7-optional-local-ai.md`](phases/phase-7-optional-local-ai.md) | Optional Ollama LLM layer | 💡 Optional |

### Subsystem Technical Specs
| File | Covers |
|---|---|
| [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md) | DuckDB schema, query patterns, SQL safety |
| [`DATA_INGESTION.md`](DATA_INGESTION.md) | CSV/XLSX/JSON/Parquet import implementations |
| [`DATA_PROFILING.md`](DATA_PROFILING.md) | 4-dimension quality scoring + issue detection |
| [`ANALYTICS_ENGINE.md`](ANALYTICS_ENGINE.md) | Analysis types (descriptive, correlation, group, time-series) |
| [`VISUALIZATION_ENGINE.md`](VISUALIZATION_ENGINE.md) | ECharts chart selection + guard rules |
| [`INSIGHT_ENGINE.md`](INSIGHT_ENGINE.md) | Insight templates + evidence linking |
| [`LOCAL_AI.md`](LOCAL_AI.md) | Phase 7 Ollama integration spec |

### Operational
| File | Covers |
|---|---|
| [`SECURITY.md`](SECURITY.md) | Threat model, SQL injection prevention, sandboxing |
| [`TESTING.md`](TESTING.md) | Testing strategy, checklist per phase |

### AI-Assisted Development
| File | Covers |
|---|---|
| [`contributing/AI_AGENTS.md`](contributing/AI_AGENTS.md) | Agent roles and shared rules |
| [`contributing/architect.md`](contributing/architect.md) | Architecture decisions |
| [`contributing/builder.md`](contributing/builder.md) | Code writing |
| [`contributing/debugger.md`](contributing/debugger.md) | Debugging |
| [`contributing/reviewer.md`](contributing/reviewer.md) | Code review |

---

## Architecture Summary (Data Flow)

```
User drops CSV
     │
     ▼
[Electron IPC] select-csv-file / import-csv
     │
     ▼
[importCsv.ts] → DuckDB read_csv_auto()
     │
     ▼
[typeDetector.ts] → classifies columns (numeric/categorical/date/boolean/text/identifier)
     │
     ▼
[qualityScore.ts] → 4-dimension quality score + issue list
     │
     ▼
[ruleEngine.ts] → filters applicable analyses (descriptive_stats, group_aggregation, correlation, time_series)
     │
     ▼
[analytics/*] → parameterized DuckDB SQL queries          [Phase 3+]
     │
     ▼
[chartSelector.ts] → ECharts configuration objects        [Phase 3+]
     │
     ▼
[insightGenerator.ts] → evidence-backed insight text      [Phase 5+]
     │
     ▼
React UI (ImportPanel → QualityCard + AnalysisList → ChartGrid → InsightList)
```

## Knowledge Graph

The codebase has been indexed by graphify (213 nodes, 296 edges, 15 communities).

- **Interactive graph:** [`../graphify-out/graph.html`](../graphify-out/graph.html) — open in browser
- **Report:** [`../graphify-out/GRAPH_REPORT.md`](../graphify-out/GRAPH_REPORT.md)
- **Raw data:** [`../graphify-out/graph.json`](../graphify-out/graph.json)
