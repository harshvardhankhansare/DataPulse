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
import { registerPersistenceHandlers } from './persistenceHandlers.js';

export function registerIpcHandlers() {
  const handleSelectFile = async (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [
        { name: 'Supported Datasets (CSV, Excel, JSON, Parquet)', extensions: ['csv', 'xlsx', 'json', 'parquet'] },
        { name: 'CSV files', extensions: ['csv'] },
        { name: 'Excel Spreadsheets', extensions: ['xlsx'] },
        { name: 'JSON files', extensions: ['json'] },
        { name: 'Parquet files', extensions: ['parquet'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  };

  ipcMain.handle('select-file', handleSelectFile);

  const handleImportFile = async (_event: Electron.IpcMainInvokeEvent, filePath: string) => {
    try {
      const tableName = 'imported_data';

      // First, drop the table and any previous undo snapshots if they exist (for re-imports)
      try {
        await query(`DROP TABLE IF EXISTS "${tableName}"`);
        const tables = await query('SHOW TABLES');
        for (const row of tables) {
          const name = String((row as Record<string, unknown>).name || (row as Record<string, unknown>).tableName || Object.values(row)[0] || '');
          if (name.startsWith(`${tableName}__undo_`)) {
            await query(`DROP TABLE IF EXISTS "${name}"`);
          }
        }
      } catch {
        // Ignore errors if table/snapshots don't exist
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

  registerAnalyticsHandlers(query);
  registerAiHandlers(query);
  registerSimulationHandlers(query);
  registerPrivacyHandlers(query);
  registerDiagnosticHandlers(query);
  registerReportingHandlers(query);
  registerLakehouseHandlers(query);
  registerEditorHandlers(query);
  registerPersistenceHandlers();
}
