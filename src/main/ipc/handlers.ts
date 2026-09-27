import { dialog, ipcMain, BrowserWindow } from 'electron';
import { importFile } from '../../core/ingestion/importFile.js';
import { detectSchema } from '../../core/schema/typeDetector.js';
import { profileQuality } from '../../core/profiler/qualityScore.js';
import { selectApplicableAnalyses } from '../../core/rules/ruleEngine.js';
import { query } from '../duckdb/connection.js';

import { registerAnalyticsHandlers } from './analyticsHandlers.js';
import { registerAiHandlers } from './aiHandlers.js';
import { registerSimulationHandlers } from './simulationHandlers.js';
import { registerPrivacyHandlers } from './privacyHandlers.js';
import { registerDiagnosticHandlers } from './diagnosticHandlers.js';
import { registerReportingHandlers } from './reportingHandlers.js';
import { registerLakehouseHandlers } from './lakehouseHandlers.js';
import { registerEditorHandlers } from './editorHandlers.js';

export function registerIpcHandlers() {
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

  registerAnalyticsHandlers(query);
  registerAiHandlers(query);
  registerSimulationHandlers(query);
  registerPrivacyHandlers(query);
  registerDiagnosticHandlers(query);
  registerReportingHandlers(query);
  registerLakehouseHandlers(query);
  registerEditorHandlers(query);
}
