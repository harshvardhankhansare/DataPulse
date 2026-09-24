# DataPulse — The Intelligent Offline Spreadsheet & Data Studio

> **Like a private, intelligent Excel that automatically finds trends, fixes mistakes, tests "what-if" scenarios, and answers questions in plain English — 100% offline, zero cloud, zero data leaves your computer.**

![DataPulse](https://img.shields.io/badge/DataPulse-1.0.0-blue.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)
![Security](https://img.shields.io/badge/Privacy-100%25%20Offline%20%7C%20Air--Gapped-emerald.svg)
![DuckDB](https://img.shields.io/badge/DuckDB-In--Memory%20Engine-yellow.svg)
![Electron](https://img.shields.io/badge/Desktop-Electron%20%2B%20React-47848F.svg)

---

### 💡 If You Need to Explain This Project to a Teacher, Recruiter, or Normal Person:

| Complicated Technical Term | Plain English (What it actually means) |
| :--- | :--- |
| **"Air-gapped Zero-Cloud Architecture"** | **Your files never leave your computer.** Safe for private company or personal data. |
| **"DuckDB Columnar Lakehouse Engine"** | **It handles huge files instantly without freezing or lagging.** |
| **"Automated Exploratory Data Analysis & Outliers"** | **It finds mistakes, strange numbers, and key trends for you automatically.** |
| **"Scenario Elasticity Simulator"** | **A "What-If" slider tool** (e.g., *"What happens to profit if I increase prices by 10%?"*). |
| **"Local LLM Natural Language SQL Agent"** | **You can just ask questions in plain English** (e.g., *"Show top 5 customers"*), and it gives you the answer. |
| **"Interactive In-App Data Cleaning"** | **Double-click any cell to fix typos, delete bad rows, and export a clean CSV.** |

---

## 🎯 Why Was DataPulse Built?

1. **Most people don't know how to write code or SQL:** Business owners, students, and managers just want clear charts and direct answers from their files without writing Python scripts.
2. **Uploading company data to ChatGPT is a privacy risk:** Companies strictly forbid uploading confidential sales, customer, or financial data to online AI services. DataPulse works **100% offline with zero internet access**.
3. **Excel freezes on large files:** When you open a 200,000+ row file in Excel, your computer slows to a crawl. DataPulse uses an ultra-fast in-memory engine that processes large files in milliseconds.

---

## 🚀 What Can You Do in DataPulse?

### 1. 📊 Interactive Data Table & 1-Click Cleaner
* **Browse your actual data**: View all rows with instant search and pagination.
* **Double-click to edit**: Fix typos or replace wrong numbers directly inside the grid.
* **1-Click Cleaning Tools**:
  * 🧹 **Remove Duplicates**: Instantly scans your file and removes duplicate rows.
  * 🩹 **Fill Empty Cells**: Replaces missing numbers with zeros in one click.
  * ✂️ **Trim Extra Spaces**: Cleans up trailing and leading spaces from names and text.
* **Export Cleaned CSV**: Download your cleaned, updated file with a single click.

### 2. 📈 Visual Charts & Key Patterns
* The second you drop a file (CSV, Excel `.xlsx`, JSON, or Parquet), DataPulse automatically creates interactive charts.
* **Click-to-Filter**: Click on any slice of a chart (e.g., *"Electronics"* or *"North America"*) and the entire dashboard instantly updates to show only that category.

### 3. 🎛️ What-If Business Calculator
* Move interactive sliders (e.g., *Price $+10\%$*, *Volume $-5\%$*, *Discount $+2\%$*) to see hypothetical future outcomes on your revenue or profit.
* Pre-set buttons for **"Growth Strategy"**, **"Cost Reduction"**, and **"Stress Test"**.

### 4. 🔍 Problem Finder (Why Did It Happen?)
* Instead of guessing why numbers changed, the Diagnostic Assistant automatically investigates the drivers behind sudden drops or peaks.
* Produces clear visual waterfall charts explaining what factors caused the change.

### 5. 💡 Key Findings in Plain English
* No confusing statistical equations. DataPulse writes simple bullet points like:
  * *“💡 Key Finding: 74% of revenue comes from just 2 product categories.”*
  * *“⚠️ Warning: There are 18 extreme outliers in the pricing column.”*

### 6. 📑 1-Page Summary Report & PDF Export
* Ready-to-present executive summary with top KPIs, scorecards, and highlights.
* Print or save directly to PDF for team meetings and executive reviews.

### 7. 🛡️ Protect Sensitive Customer Information
* Automatically detects private information (names, emails, phone numbers, credit card numbers).
* Offers 1-click anonymization (hashing or masking with `***`) and a zero-trace memory purge so no sensitive data remains in memory.

### 8. 💬 Ask Questions in Plain English
* Ask natural questions like:
  * *"Show me the top 5 customers by sales"*
  * *"Compare average order value across regions"*
* Powered by optional local AI models (via Ollama or LM Studio) running entirely offline on your own machine.

---

## ⚡ How to Run DataPulse on Your Computer

### Prerequisites
* [Node.js](https://nodejs.org/) (Version 18, 20, or 22)
* npm (comes with Node.js)

### Quick Start
```bash
# 1. Clone this repository
git clone https://github.com/harshvardhankhansare/DataPulse.git

# 2. Open the folder
cd DataPulse

# 3. Install packages
npm install

# 4. Launch the application
npm start
```

---

## 🏗️ For Developers & Engineers: Technical Architecture

For those interested in the under-the-hood systems engineering:

```
┌────────────────────────────────────────────────────────┐
│                   Electron Desktop App                 │
│                                                        │
│   ┌────────────────────────────────────────────────┐   │
│   │       React 18 + TypeScript + Vite UI          │   │
│   │   (Data Editor, ECharts, Interactive Sliders)  │   │
│   └──────────────────────┬─────────────────────────┘   │
│                          │ ContextBridge (Isolated)    │
│   ┌──────────────────────▼─────────────────────────┐   │
│   │             IPC Controller Handlers            │   │
│   └──────────────────────┬─────────────────────────┘   │
│                          │                             │
│   ┌──────────────────────▼─────────────────────────┐   │
│   │           Embedded DuckDB OLAP Engine          │   │
│   │  - In-memory columnar storage                  │   │
│   │  - Multi-file Relational Lakehouse (JOINs)     │   │
│   │  - Row-level mutations & SQL analytics         │   │
│   │  - Sub-5ms query execution                     │   │
│   └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Desktop Runtime** | Electron 33 | Sandboxed desktop application shell with zero web exposure |
| **Language** | TypeScript 5.6 | 100% strict type safety across Main, Core, and UI layers |
| **Database Engine** | DuckDB 1.4 | Embedded in-memory columnar database |
| **User Interface** | React 18 + Vite 5 | Reactive UI with custom executive dark theme |
| **Visual Charts** | Apache ECharts | High-performance Canvas/SVG interactive chart rendering |
| **Spreadsheet Engine** | SheetJS (`xlsx`) | Fast local Excel file parsing |
| **Local AI (Optional)** | Ollama / LM Studio | Local LLM inference for natural language query generation |

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
Created with ❤️ by **Harshvardhan Khansare**.
