# DataPulse — Offline Data Intelligence & In-Memory Lakehouse

> **High-Performance Offline Analytics, In-Memory Lakehouse, Autonomous AI Diagnostics, and Air-Gapped Privacy Vault powered by DuckDB, React 18, and Local LLMs.**

![DataPulse](https://img.shields.io/badge/DataPulse-1.0.0-blue.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)
![DuckDB](https://img.shields.io/badge/DuckDB-1.4.4-yellow.svg)
![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)
![React](https://img.shields.io/badge/React-18-61DAFB.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6.svg)
![Air--Gapped](https://img.shields.io/badge/Security-Air--Gapped-emerald.svg)

---

## 🌟 Overview

**DataPulse** is a zero-latency, 100% offline desktop intelligence suite designed for data engineers, analysts, and decision-makers working in restricted, high-compliance, or privacy-critical environments. 

By executing directly inside an embedded **in-memory columnar DuckDB OLAP engine**, DataPulse processes millions of rows in sub-5ms latency with **zero cloud dependencies, zero external database servers, and zero network telemetry**.

---

## 🚀 Key Features

### 🔀 1. Offline Relational Lakehouse & Smart Auto-Join
* Ingest mixed-format datasets simultaneously (**CSV, XLSX, JSON, Parquet**).
* **Automatic Foreign Key Detection**: Heuristic and probabilistic key matching (`id` ↔ `customer_id`, `sku`, `user_id`) using sub-5ms DuckDB set intersection (`INTERSECT`) to calculate real overlap percentages.
* **Visual Join Studio**: Select join types (`LEFT`, `INNER`, `FULL`, `RIGHT`) and instantly compile unified in-memory warehouse views with automatic column disambiguation.

### 🎯 2. Click-to-Drill Cross-Filtering
* Interactive chart slicing on Donut slices, Bar charts, Pie segments, and Funnel stages.
* Global context synchronization that parameterizes all analytical queries across distribution statistics, time series, and correlations in real-time.
* Automatic hierarchical drill-downs into secondary categorical dimensions.

### 🧪 3. "What-If" Scenario Simulator & Driver Sensitivity
* **Automatic Lever Detection**: Identifies business targets (Revenue, Profit, Sales) and controllable drivers (Price, Volume, Discount %, Cost).
* **Elasticity Ranking & Tornado Chart**: Perturbs drivers by $+10\%$ to compute partial derivative elasticity.
* **Compounded In-Memory Projections**: Dynamic SQL calculations with range sliders ($-50\%$ to $+100\%$) and presets (*Aggressive Growth*, *Conservative*, *Stress Test*).

### 🛡️ 4. Air-Gapped Privacy Vault & PII Redaction
* **Automated PII Scanner**: Regex and semantic header detection for Emails, Phone Numbers, Credit Cards, SSNs, IP Addresses, and Names.
* **Compliance Tagging**: Automated risk assessments for GDPR, HIPAA, PCI-DSS, and SOC-2 Type II.
* **SQL Masking Views**: Transparent in-memory masking with partial masking, full redaction, or cryptographic hashes.
* **Volatile Memory Zeroizer**: Native memory purger executing DuckDB `CHECKPOINT` and V8 garbage collection to guarantee zero data remanence upon exit.

### 🧠 5. Autonomous Diagnostic AI Agent
* **Multi-Step Root-Cause Engine**: Executes a 3-step chained investigation (Macro Scan ➔ Variance Decomposition ➔ Secondary Factor Isolation).
* **Mathematical Variance Attribution**: Normalizes cohort drags and lifts.
* **ECharts Waterfall Bridge**: Visualizes positive drivers and negative drags connecting baseline to current periods.
* **Strategic Next Steps**: Formulates executive operational directives backed by SQL audit receipts.

### 📑 6. Executive Briefing & 1-Click Presentation Generator
* **C-Suite Narrative Synthesis**: Automated generation of macro KPI scorecards, strategic findings, and variance summaries.
* **Standalone Zero-Dependency HTML Export**: Exports self-contained, offline-viewable interactive HTML dashboards.
* **Corporate PDF Export**: Native Electron print-to-PDF formatting tailored for executive presentations.

### 🤖 7. Local AI Natural Language Query (LM Studio / Ollama)
* Ask plain-English questions to query datasets directly.
* Connects locally to **LM Studio** or **Ollama** (`http://127.0.0.1:1234/v1` or `http://127.0.0.1:11434/v1`).
* **AST SQL Guardrails**: Strictly validates and sandboxes AI queries, enforcing read-only execution.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Desktop Shell** | [Electron 33](https://www.electronjs.org/) | Cross-platform desktop runtime with strict IPC isolation |
| **Language** | [TypeScript 5.6](https://www.typescriptlang.org/) | End-to-end type safety across Main, Core, and Renderer |
| **Analytics Engine** | [DuckDB 1.4](https://duckdb.org/) | Embedded in-process columnar OLAP database in RAM |
| **Frontend UI** | [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/) | Lightning-fast reactive component tree and HMR bundling |
| **Visualization** | [Apache ECharts 6](https://echarts.apache.org/) | High-performance Canvas/SVG interactive chart rendering |
| **Spreadsheet Engine** | [SheetJS (xlsx)](https://sheetjs.com/) | High-speed offline Excel workbook parser |
| **State Management** | [Zustand 5](https://github.com/pmndrs/zustand) | Minimalistic, reactive state container |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) + CSS Tokens | Custom executive dark theme design system |

---

## ⚡ Quick Start

### Prerequisites
* **Node.js**: `v20+` or `v22+` recommended
* **npm**: `v9+` or `v10+`

### Installation
```bash
# Clone the repository
git clone https://github.com/your-username/OfflineDataIntelligence.git

# Navigate into the project directory
cd OfflineDataIntelligence

# Install dependencies
npm install
```

### Development
```bash
# Start Vite and Electron concurrently in development mode
npm run dev
```

### Building for Production
```bash
# Run strict TypeScript type verification
npm run type-check

# Compile production bundles for Renderer and Main process
npm run build

# Launch production build
npm start
```

### Packaging Desktop Installer
```bash
# Package as standalone OS installer (.exe / .dmg / .AppImage)
npm run build:electron
```

---

## 🔒 Security & Air-Gapped Privacy Guarantee

* **100% Offline Execution**: All queries, statistical aggregations, and joins run in your local system's RAM via embedded DuckDB.
* **Zero Telemetry**: No tracking, analytics pings, or cloud API calls are made.
* **AST SQL Validator**: Restricts AI queries to verified read-only `SELECT` statements with parameter validation.
* **Volatile Memory Sanitization**: Drops views, calls DuckDB `CHECKPOINT`, and invokes garbage collection to purge memory upon request or session termination.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
