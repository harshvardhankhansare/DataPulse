import { ipcMain } from 'electron';
import { detectSchema } from '../../core/schema/typeDetector.js';
import { getDiagnosticTargets, runDiagnosticInvestigation } from '../../core/diagnostic/diagnosticAgent.js';

export function registerDiagnosticHandlers(query: (sql: string) => Promise<any[]>) {
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
}
