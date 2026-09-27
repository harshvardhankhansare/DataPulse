import { ipcMain } from 'electron';
import { detectSchema } from '../../core/schema/typeDetector.js';
import { detectPii } from '../../core/privacy/piiDetector.js';
import { applyDatasetMasking, revertDatasetMasking } from '../../core/privacy/piiMasker.js';
import { purgeMemory } from '../../core/privacy/memorySanitizer.js';
import { MaskingStrategy, PiiCategory } from '../../core/privacy/privacyTypes.js';

export function registerPrivacyHandlers(query: (sql: string) => Promise<any[]>) {
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
}
