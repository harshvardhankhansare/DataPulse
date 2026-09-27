import { ipcMain, dialog, BrowserWindow } from 'electron';
import { detectSchema } from '../../core/schema/typeDetector.js';
import fs from 'fs';
import { generateExecutiveBriefing } from '../../core/reporting/briefingGenerator.js';
import { buildStandaloneHtmlReport } from '../../core/reporting/htmlReportBuilder.js';
import { ExecutiveBriefing } from '../../core/reporting/reportingTypes.js';

export function registerReportingHandlers(query: (sql: string) => Promise<any[]>) {
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
}
