import { ipcMain, dialog, BrowserWindow } from 'electron';
import { importMultipleFiles, createJoinView } from '../../core/lakehouse/lakehouseEngine.js';
import { JoinPlan } from '../../core/lakehouse/lakehouseTypes.js';

export function registerLakehouseHandlers(query: (sql: string) => Promise<any[]>) {
  ipcMain.handle('lakehouse:select-files', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Supported Datasets (CSV, Excel, JSON, Parquet)', extensions: ['csv', 'xlsx', 'json', 'parquet'] },
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
