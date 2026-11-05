import fs from 'fs';
import path from 'path';
import { ipcMain, dialog, BrowserWindow } from 'electron';
import { detectSchema } from '../../core/schema/typeDetector.js';
import { profileQuality } from '../../core/profiler/qualityScore.js';
import { selectApplicableAnalyses } from '../../core/rules/ruleEngine.js';
import { query } from '../duckdb/connection.js';

/** Name of the metadata table stamped into saved project files. */
const META_TABLE = '_datapulse_meta';

/** Escape a value for safe interpolation into a single-quoted SQL string literal. */
function sqlStr(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** Drop every table/view currently held in the in-memory database. */
async function clearInMemoryDatabase(): Promise<void> {
    const rows = await query('SHOW TABLES');
    for (const row of rows) {
        const name = String((row as Record<string, unknown>).name);
        await query(`DROP TABLE IF EXISTS "${name}"`);
        await query(`DROP VIEW IF EXISTS "${name}"`);
    }
}

export function registerPersistenceHandlers() {
    /* ── Save the whole in-memory database to a .duckdb project file ── */
    ipcMain.handle('persistence:save-project', async (event, activeTable: string, fileName: string | null) => {
        try {
            const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
            const defaultBase = fileName ? fileName.replace(/\.[^.]+$/, '') : 'datapulse-project';
            const result = await dialog.showSaveDialog(win!, {
                title: 'Save DataPulse Project',
                defaultPath: `${defaultBase}.duckdb`,
                filters: [{ name: 'DataPulse Project', extensions: ['duckdb'] }],
            });
            if (result.canceled || !result.filePath) return { success: false, canceled: true };

            const dbPath = result.filePath;
            if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

            // Stamp metadata so the project remembers which table/file was active
            await query(
                `CREATE OR REPLACE TABLE ${META_TABLE} AS SELECT ${sqlStr(activeTable)} AS active_table, ` +
                `${fileName === null ? 'NULL' : sqlStr(fileName)} AS file_name`
            );
            // Save: ATTACH file db, copy all tables from memory, then detach
            await query(`ATTACH ${sqlStr(dbPath)} AS dp_project_save`);
            await query('COPY FROM DATABASE memory TO dp_project_save');
            await query('DETACH dp_project_save');
            await query(`DROP TABLE IF EXISTS ${META_TABLE}`);

            return { success: true, filePath: dbPath };
        } catch (error) {
            console.error('persistence:save-project failed:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });

    /* ── Load a .duckdb project file back into the in-memory database ── */
    ipcMain.handle('persistence:open-project', async (event) => {
        let attached = false;
        try {
            const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
            const result = await dialog.showOpenDialog(win!, {
                title: 'Open DataPulse Project',
                properties: ['openFile'],
                filters: [{ name: 'DataPulse Project', extensions: ['duckdb'] }],
            });
            if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };

            const dbPath = result.filePaths[0];
            if (!fs.existsSync(dbPath)) return { success: false, error: 'Project file not found' };

            await clearInMemoryDatabase();

            await query(`ATTACH ${sqlStr(dbPath)} AS dp_project_load`);
            attached = true;
            await query('COPY FROM DATABASE dp_project_load TO memory');
            await query('DETACH dp_project_load');
            attached = false;

            // Read stamped metadata (if present) to determine the active table
            let activeTable: string | null = null;
            let fileName: string | null = null;
            try {
                const meta = await query(`SELECT active_table, file_name FROM ${META_TABLE} LIMIT 1`);
                if (meta.length > 0) {
                    const row = meta[0] as Record<string, unknown>;
                    activeTable = row.active_table ? String(row.active_table) : null;
                    fileName = row.file_name ? String(row.file_name) : null;
                }
            } catch {
                // Foreign/older project file without metadata — fall back below
            }
            await query(`DROP TABLE IF EXISTS ${META_TABLE}`);

            const tables = (await query('SHOW TABLES')).map(r => String((r as Record<string, unknown>).name));
            if (tables.length === 0) return { success: false, error: 'Project file contains no tables' };
            if (!activeTable || !tables.includes(activeTable)) activeTable = tables[0];

            const schema = await detectSchema(activeTable, query);
            const quality = await profileQuality(activeTable, schema, query);
            const applicableAnalyses = selectApplicableAnalyses(schema);

            return {
                success: true,
                schema,
                quality,
                applicableAnalyses,
                fileName: fileName ?? path.basename(dbPath),
            };
        } catch (error) {
            if (attached) {
                try { await query('DETACH dp_project_load'); } catch { /* best effort */ }
            }
            console.error('persistence:open-project failed:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });
}
