import { dialog, ipcMain, BrowserWindow } from 'electron';
import { importFile } from '../../core/ingestion/importFile.js';
import { detectSchema } from '../../core/schema/typeDetector.js';
import { profileQuality } from '../../core/profiler/qualityScore.js';
import { selectApplicableAnalyses } from '../../core/rules/ruleEngine.js';
import { runGroupAggregation } from '../../core/analytics/groupAggregation.js';
import { runDescriptiveStats } from '../../core/analytics/descriptiveStats.js';
import { runCorrelation } from '../../core/analytics/correlation.js';
import { runTimeSeries } from '../../core/analytics/timeSeries.js';
import {
  groupAggregationToChart,
  descriptiveStatsToChart,
  correlationToChart,
  timeSeriesToChart,
} from '../../core/charts/chartSelector.js';
import {
  generateGroupAggregationInsights,
  generateDescriptiveStatsInsights,
  generateCorrelationInsights,
  generateTimeSeriesInsights,
} from '../../core/insights/insightGenerator.js';
import { LocalAiClient } from '../../core/ai/localAiClient.js';
import { buildSystemPrompt, buildUserPrompt } from '../../core/ai/promptBuilder.js';
import { validateSql } from '../../core/ai/sqlValidator.js';
import { mapAiResultToChart } from '../../core/ai/aiResultMapper.js';
import { query } from '../duckdb/connection.js';
import { ActiveFilter } from '../../core/analytics/filterTypes.js';
import { detectSimulationConfig, runSimulation } from '../../core/simulation/scenarioSimulator.js';
import { detectPii } from '../../core/privacy/piiDetector.js';
import { applyDatasetMasking, revertDatasetMasking } from '../../core/privacy/piiMasker.js';
import { purgeMemory } from '../../core/privacy/memorySanitizer.js';
import { MaskingStrategy, PiiCategory } from '../../core/privacy/privacyTypes.js';
import { getDiagnosticTargets, runDiagnosticInvestigation } from '../../core/diagnostic/diagnosticAgent.js';
import fs from 'fs';
import { generateExecutiveBriefing } from '../../core/reporting/briefingGenerator.js';
import { buildStandaloneHtmlReport } from '../../core/reporting/htmlReportBuilder.js';
import { ExecutiveBriefing } from '../../core/reporting/reportingTypes.js';
import { importMultipleFiles, createJoinView } from '../../core/lakehouse/lakehouseEngine.js';
import { detectJoinCandidates } from '../../core/lakehouse/relationalMatcher.js';
import { JoinPlan } from '../../core/lakehouse/lakehouseTypes.js';

export function registerIpcHandlers() {
  const aiClient = new LocalAiClient();

  const handleSelectFile = async (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [
        { name: 'Supported Datasets (CSV, Excel, JSON, Parquet)', extensions: ['csv', 'xlsx', 'xls', 'json', 'parquet'] },
        { name: 'CSV files', extensions: ['csv'] },
        { name: 'Excel Spreadsheets', extensions: ['xlsx', 'xls'] },
        { name: 'JSON files', extensions: ['json'] },
        { name: 'Parquet files', extensions: ['parquet'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  };

  ipcMain.handle('select-file', handleSelectFile);
  ipcMain.handle('select-csv-file', handleSelectFile);

  const handleImportFile = async (_event: Electron.IpcMainInvokeEvent, filePath: string) => {
    try {
      const tableName = 'imported_data';

      // First, drop the table if it exists (for re-imports)
      try {
        await query(`DROP TABLE IF EXISTS ${tableName}`);
      } catch {
        // Ignore errors if table doesn't exist
      }

      // Import the file using unified multi-format importer
      const { format } = await importFile(filePath, tableName, query);

      // Detect schema
      const schema = await detectSchema(tableName, query);

      // Profile quality
      const quality = await profileQuality(tableName, schema, query);

      // Select applicable analyses
      const applicableAnalyses = selectApplicableAnalyses(schema);

      return { success: true, schema, quality, applicableAnalyses, format };
    } catch (error) {
      console.error('Import failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  ipcMain.handle('import-file', handleImportFile);
  ipcMain.handle('import-csv', handleImportFile);

  ipcMain.handle('run-analysis', async (_event, tableName: string, analysisType: string, filter?: ActiveFilter) => {
    try {
      const schema = await detectSchema(tableName, query);

      if (analysisType === 'group_aggregation') {
        const result = await runGroupAggregation(tableName, schema, query, filter);
        const chartConfig = groupAggregationToChart(result);
        const insights = generateGroupAggregationInsights(tableName, result, schema);
        return { success: true, chartConfig, insights };
      }

      if (analysisType === 'descriptive_stats') {
        const result = await runDescriptiveStats(tableName, schema, query, filter);
        const chartConfig = descriptiveStatsToChart(result);
        const insights = generateDescriptiveStatsInsights(tableName, result, schema);
        return { success: true, chartConfig, insights };
      }

      if (analysisType === 'correlation') {
        const result = await runCorrelation(tableName, schema, query, filter);
        const chartConfig = correlationToChart(result);
        const insights = generateCorrelationInsights(tableName, result, schema);
        return { success: true, chartConfig, insights };
      }

      if (analysisType === 'time_series') {
        const result = await runTimeSeries(tableName, schema, query, filter);
        const chartConfig = timeSeriesToChart(result);
        const insights = generateTimeSeriesInsights(tableName, result, schema);
        return { success: true, chartConfig, insights };
      }

      return { success: false, error: `Analysis type "${analysisType}" not recognized` };
    } catch (error) {
      console.error('Analysis failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('check-ai-status', async (_event, customUrl?: string) => {
    return await aiClient.checkStatus(customUrl);
  });

  ipcMain.handle('query-ai', async (_event, tableName: string, question: string, customUrl?: string) => {
    try {
      const schema = await detectSchema(tableName, query);
      const systemPrompt = buildSystemPrompt(tableName, schema);
      const userPrompt = buildUserPrompt(question);

      const rawSql = await aiClient.generateSql(userPrompt, systemPrompt, customUrl);
      const validation = validateSql(rawSql, tableName, schema);

      if (!validation.valid || !validation.cleanSql) {
        return {
          success: false,
          error: validation.error || 'SQL generated by AI failed validation.',
          sql: rawSql,
        };
      }

      const rows = await query(validation.cleanSql);
      const chartConfig = mapAiResultToChart(question, rows);

      return {
        success: true,
        sql: validation.cleanSql,
        rows,
        chartConfig,
      };
    } catch (error) {
      console.error('AI query error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('get-simulation-config', async (_event, tableName: string) => {
    try {
      const schema = await detectSchema(tableName, query);
      const config = await detectSimulationConfig(tableName, schema, query);
      return { success: true, config };
    } catch (error) {
      console.error('get-simulation-config failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('run-simulation', async (_event, tableName: string, targetCol: string, adjustments: Record<string, number>, filter?: ActiveFilter) => {
    try {
      const schema = await detectSchema(tableName, query);
      const result = await runSimulation(tableName, schema, query, targetCol, adjustments, filter);
      return { success: true, result };
    } catch (error) {
      console.error('run-simulation failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('privacy:scan-pii', async (_event, tableName: string) => {
    try {
      const schema = await detectSchema(tableName, query);
      const report = await detectPii(tableName, schema, query);
      return { success: true, report };
    } catch (error) {
      console.error('privacy:scan-pii failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('privacy:apply-masking', async (_event, tableName: string, columnRules: Record<string, { category: PiiCategory; strategy: MaskingStrategy }>) => {
    try {
      const schema = await detectSchema(tableName, query);
      const result = await applyDatasetMasking(tableName, schema, columnRules, query);
      return result;
    } catch (error) {
      console.error('privacy:apply-masking failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('privacy:revert-masking', async (_event, tableName: string) => {
    try {
      const result = await revertDatasetMasking(tableName, query);
      return result;
    } catch (error) {
      console.error('privacy:revert-masking failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('privacy:purge-memory', async () => {
    try {
      const receipt = await purgeMemory(query);
      return { success: true, receipt };
    } catch (error) {
      console.error('privacy:purge-memory failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('privacy:get-airgap-status', async () => {
    try {
      const tableRows = await query(`SELECT count(*) as c FROM information_schema.tables WHERE table_schema = 'main'`);
      const tableCount = Number(tableRows[0]?.c || 0);
      const memMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
      return {
        success: true,
        status: {
          isAirGapped: true,
          outboundRequestsCount: 0,
          storageMode: '100% In-Memory RAM (DuckDB)' as const,
          activeSessionDurationSec: Math.floor(process.uptime()),
          tableCount,
          allocatedMemoryMb: memMb,
        },
      };
    } catch (error) {
      console.error('privacy:get-airgap-status failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('diagnostic:get-targets', async (_event, tableName: string) => {
    try {
      const schema = await detectSchema(tableName, query);
      const targets = getDiagnosticTargets(schema);
      return { success: true, targets };
    } catch (error) {
      console.error('diagnostic:get-targets failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(
    'diagnostic:investigate',
    async (
      _event,
      tableName: string,
      targetCol?: string,
      dimensionCol?: string,
      question?: string
    ) => {
      try {
        const schema = await detectSchema(tableName, query);
        const report = await runDiagnosticInvestigation(
          tableName,
          schema,
          query,
          targetCol,
          dimensionCol,
          question
        );
        return { success: true, report };
      } catch (error) {
        console.error('diagnostic:investigate failed:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  ipcMain.handle(
    'reporting:generate-briefing',
    async (_event, tableName: string, fileName?: string, quality?: any, insights?: any[]) => {
      try {
        const schema = await detectSchema(tableName, query);
        const briefing = await generateExecutiveBriefing(
          tableName,
          schema,
          quality || null,
          insights || [],
          query,
          fileName
        );
        return { success: true, briefing };
      } catch (error) {
        console.error('reporting:generate-briefing failed:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  ipcMain.handle(
    'reporting:export-html',
    async (event, briefing: ExecutiveBriefing, chartImages?: Record<string, string>) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
        const saveRes = await dialog.showSaveDialog(win!, {
          title: 'Export Interactive Executive Briefing HTML',
          defaultPath: `Executive_Briefing_${briefing.datasetName.replace(/[^a-zA-Z0-9]/g, '_')}.html`,
          filters: [{ name: 'HTML Document', extensions: ['html'] }],
        });

        if (saveRes.canceled || !saveRes.filePath) {
          return { success: false, error: 'Save canceled' };
        }

        const htmlContent = buildStandaloneHtmlReport(briefing, chartImages);
        await fs.promises.writeFile(saveRes.filePath, htmlContent, 'utf-8');
        return { success: true, filePath: saveRes.filePath };
      } catch (error) {
        console.error('reporting:export-html failed:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  ipcMain.handle('reporting:export-pdf', async (event, datasetName?: string) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
      if (!win) throw new Error('No active window found for PDF export');

      const saveRes = await dialog.showSaveDialog(win, {
        title: 'Export Executive Briefing PDF',
        defaultPath: `Executive_Briefing_${(datasetName || 'Report').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
      });

      if (saveRes.canceled || !saveRes.filePath) {
        return { success: false, error: 'Save canceled' };
      }

      const pdfBuffer = await win.webContents.printToPDF({
        pageSize: 'A4',
        landscape: true,
        printBackground: true,
      });

      await fs.promises.writeFile(saveRes.filePath, pdfBuffer);
      return { success: true, filePath: saveRes.filePath };
    } catch (error) {
      console.error('reporting:export-pdf failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('lakehouse:select-files', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Supported Datasets (CSV, Excel, JSON, Parquet)', extensions: ['csv', 'xlsx', 'xls', 'json', 'parquet'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths;
  });

  ipcMain.handle('lakehouse:import-files', async (_event, filePaths: string[]) => {
    try {
      const result = await importMultipleFiles(filePaths, query);
      return { success: true, ...result };
    } catch (error) {
      console.error('lakehouse:import-files failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('lakehouse:detect-joins', async (_event, tables: any[]) => {
    try {
      const candidates = await detectJoinCandidates(tables, query);
      return { success: true, candidates };
    } catch (error) {
      console.error('lakehouse:detect-joins failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('lakehouse:create-join-view', async (_event, plan: JoinPlan) => {
    try {
      const result = await createJoinView(plan, query);
      return result;
    } catch (error) {
      console.error('lakehouse:create-join-view failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}


