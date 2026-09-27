import { ipcMain } from 'electron';
import { detectSchema } from '../../core/schema/typeDetector.js';
import { detectSimulationConfig, runSimulation } from '../../core/simulation/scenarioSimulator.js';
import { ActiveFilter } from '../../core/analytics/filterTypes.js';

export function registerSimulationHandlers(query: (sql: string) => Promise<any[]>) {
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
}
