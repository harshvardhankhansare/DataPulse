import { ipcMain, dialog, BrowserWindow } from 'electron';

const MAX_UNDO_SNAPSHOTS = 5;
let undoCounter = 0;

function extractTableName(t: any): string {
  if (!t) return '';
  return String(t.name || t.tableName || Object.values(t)[0] || '');
}

/** Create a snapshot of the table before a destructive operation. */
async function createSnapshot(query: (sql: string) => Promise<any[]>, tableName: string): Promise<void> {
  undoCounter++;
  const snapshotName = `${tableName}__undo_${undoCounter}`;
  console.log(`[undo] createSnapshot → ${snapshotName}`);
  await query(`CREATE OR REPLACE TABLE "${snapshotName}" AS SELECT * FROM "${tableName}"`);

  // Keep only the latest MAX_UNDO_SNAPSHOTS snapshots
  const tables = await query('SHOW TABLES');
  const allNames = tables.map(extractTableName);
  const snapshots = allNames
    .filter(n => n.startsWith(`${tableName}__undo_`))
    .map(n => ({ name: n, num: parseInt(n.split('__undo_')[1], 10) }))
    .sort((a, b) => a.num - b.num);

  console.log(`[undo] snapshots after create: [${snapshots.map(s => s.name).join(', ')}]`);

  while (snapshots.length > MAX_UNDO_SNAPSHOTS) {
    const oldest = snapshots.shift()!;
    await query(`DROP TABLE IF EXISTS "${oldest.name}"`);
  }
}

/** Get the latest snapshot name for a table, or null if none exists. */
async function getLatestSnapshot(query: (sql: string) => Promise<any[]>, tableName: string): Promise<string | null> {
  const tables = await query('SHOW TABLES');
  const allNames = tables.map(extractTableName);
  console.log(`[undo] getLatestSnapshot: all tables = [${allNames.join(', ')}]`);
  const snapshots = allNames
    .filter(n => n.startsWith(`${tableName}__undo_`))
    .map(n => ({ name: n, num: parseInt(n.split('__undo_')[1], 10) }))
    .sort((a, b) => b.num - a.num);
  const result = snapshots.length > 0 ? snapshots[0].name : null;
  console.log(`[undo] getLatestSnapshot result: ${result}`);
  return result;
}

/** Get undo status for a table. */
async function getUndoStatus(query: (sql: string) => Promise<any[]>, tableName: string): Promise<{ canUndo: boolean; snapshotCount: number }> {
  const tables = await query('SHOW TABLES');
  const allNames = tables.map(extractTableName);
  const snapshots = allNames.filter(n => n.startsWith(`${tableName}__undo_`));
  const result = { canUndo: snapshots.length > 0, snapshotCount: snapshots.length };
  console.log(`[undo] getUndoStatus(${tableName}): canUndo=${result.canUndo}, count=${result.snapshotCount}, snaps=[${snapshots.join(', ')}]`);
  return result;
}

export function registerEditorHandlers(query: (sql: string) => Promise<any[]>) {
  ipcMain.handle('editor:get-table-rows', async (_event, tableName: string, limit = 50, offset = 0, search = '') => {
    try {
      const safeTable = `"${tableName.replace(/"/g, '""')}"`;
      // Get total count
      const countRes = await query(`SELECT COUNT(*) as total FROM ${safeTable}`);
      const totalCount = Number(countRes[0]?.total ?? 0);

      // Columns list
      const colRes = await query(`PRAGMA table_info('${tableName.replace(/'/g, "''")}')`);
      const columns = colRes.map((c: any) => c.name);

      let sql = `SELECT rowid, * FROM ${safeTable}`;
      try {
        await query(`SELECT rowid FROM ${safeTable} LIMIT 1`);
      } catch {
        sql = `SELECT row_number() OVER () AS rowid, * FROM ${safeTable}`;
      }

      if (search && search.trim()) {
        const cleanSearch = search.trim().replace(/'/g, "''");
        const matchConditions = columns.map((col: string) => `CAST("${col.replace(/"/g, '""')}" AS VARCHAR) ILIKE '%${cleanSearch}%'`);
        if (matchConditions.length > 0) {
          sql += ` WHERE (${matchConditions.join(' OR ')})`;
        }
      }

      sql += ` LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      const rows = await query(sql);
      return { success: true, rows, totalCount, columns };
    } catch (error) {
      console.error('editor:get-table-rows failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('editor:update-cell', async (_event, tableName: string, rowid: number, column: string, value: any) => {
    try {
      await createSnapshot(query, tableName);
      const safeTable = `"${tableName.replace(/"/g, '""')}"`;
      const safeCol = column.replace(/"/g, '""');
      let valSql = 'NULL';
      if (value !== null && value !== undefined && value !== '') {
        if (typeof value === 'number') {
          valSql = String(value);
        } else {
          valSql = `'${String(value).replace(/'/g, "''")}'`;
        }
      }
      await query(`UPDATE ${safeTable} SET "${safeCol}" = ${valSql} WHERE rowid = ${Number(rowid)}`);
      return { success: true };
    } catch (error) {
      console.error('editor:update-cell failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('editor:delete-row', async (_event, tableName: string, rowid: number) => {
    try {
      await createSnapshot(query, tableName);
      const safeTable = `"${tableName.replace(/"/g, '""')}"`;
      await query(`DELETE FROM ${safeTable} WHERE rowid = ${Number(rowid)}`);
      return { success: true };
    } catch (error) {
      console.error('editor:delete-row failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('editor:clean-data', async (_event, tableName: string, action: string) => {
    try {
      await createSnapshot(query, tableName);
      const safeTable = `"${tableName.replace(/"/g, '""')}"`;
      if (action === 'remove_duplicates') {
        const before = await query(`SELECT COUNT(*) as c FROM ${safeTable}`);
        await query(`CREATE OR REPLACE TABLE ${safeTable} AS SELECT DISTINCT * FROM ${safeTable}`);
        const after = await query(`SELECT COUNT(*) as c FROM ${safeTable}`);
        const removed = Number(before[0]?.c ?? 0) - Number(after[0]?.c ?? 0);
        return { success: true, message: `Removed ${removed} duplicate rows.` };
      } else if (action === 'fill_nulls_zero') {
        const cols = await query(`PRAGMA table_info('${tableName.replace(/'/g, "''")}')`);
        let filledCount = 0;
        for (const col of cols) {
          const type = String(col.type).toUpperCase();
          if (type.includes('INT') || type.includes('DOUBLE') || type.includes('FLOAT') || type.includes('DECIMAL') || type.includes('NUMERIC') || type.includes('BIGINT')) {
            await query(`UPDATE ${safeTable} SET "${col.name.replace(/"/g, '""')}" = 0 WHERE "${col.name.replace(/"/g, '""')}" IS NULL`);
            filledCount++;
          }
        }
        return { success: true, message: `Replaced empty values with 0 in ${filledCount} numeric columns.` };
      } else if (action === 'fill_nulls_mean') {
        const cols = await query(`PRAGMA table_info('${tableName.replace(/'/g, "''")}')`);
        let filledCount = 0;
        for (const col of cols) {
          const type = String(col.type).toUpperCase();
          if (type.includes('INT') || type.includes('DOUBLE') || type.includes('FLOAT') || type.includes('DECIMAL') || type.includes('NUMERIC') || type.includes('BIGINT')) {
            const escCol = `"${col.name.replace(/"/g, '""')}"`;
            const avgRes = await query(`SELECT ROUND(AVG(${escCol}), 2) as avg_val FROM ${safeTable} WHERE ${escCol} IS NOT NULL`);
            const avgVal = avgRes[0]?.avg_val;
            if (avgVal !== null && avgVal !== undefined) {
              await query(`UPDATE ${safeTable} SET ${escCol} = ${avgVal} WHERE ${escCol} IS NULL`);
              filledCount++;
            }
          }
        }
        return { success: true, message: `Filled missing numbers with column average in ${filledCount} columns.` };
      } else if (action === 'fill_nulls_median') {
        const cols = await query(`PRAGMA table_info('${tableName.replace(/'/g, "''")}')`);
        let filledCount = 0;
        for (const col of cols) {
          const type = String(col.type).toUpperCase();
          if (type.includes('INT') || type.includes('DOUBLE') || type.includes('FLOAT') || type.includes('DECIMAL') || type.includes('NUMERIC') || type.includes('BIGINT')) {
            const escCol = `"${col.name.replace(/"/g, '""')}"`;
            const medRes = await query(`SELECT MEDIAN(${escCol}) as med_val FROM ${safeTable} WHERE ${escCol} IS NOT NULL`);
            const medVal = medRes[0]?.med_val;
            if (medVal !== null && medVal !== undefined) {
              await query(`UPDATE ${safeTable} SET ${escCol} = ${medVal} WHERE ${escCol} IS NULL`);
              filledCount++;
            }
          }
        }
        return { success: true, message: `Filled missing numbers with column median in ${filledCount} columns.` };
      } else if (action === 'fill_nulls_mode') {
        const cols = await query(`PRAGMA table_info('${tableName.replace(/'/g, "''")}')`);
        let filledCount = 0;
        for (const col of cols) {
          const type = String(col.type).toUpperCase();
          if (type.includes('VARCHAR') || type.includes('TEXT') || type.includes('CHAR')) {
            const escCol = `"${col.name.replace(/"/g, '""')}"`;
            const modeRes = await query(`SELECT ${escCol} as mode_val, COUNT(*) as cnt FROM ${safeTable} WHERE ${escCol} IS NOT NULL GROUP BY ${escCol} ORDER BY cnt DESC LIMIT 1`);
            const modeVal = modeRes[0]?.mode_val;
            if (modeVal !== null && modeVal !== undefined) {
              const safeVal = String(modeVal).replace(/'/g, "''");
              await query(`UPDATE ${safeTable} SET ${escCol} = '${safeVal}' WHERE ${escCol} IS NULL OR ${escCol} = ''`);
              filledCount++;
            }
          }
        }
        return { success: true, message: `Filled empty text cells with most common value in ${filledCount} columns.` };
      } else if (action === 'drop_null_rows') {
        const before = await query(`SELECT COUNT(*) as c FROM ${safeTable}`);
        const cols = await query(`PRAGMA table_info('${tableName.replace(/'/g, "''")}')`);
        if (cols.length > 0) {
          const conditions = cols.map((c: any) => `"${c.name.replace(/"/g, '""')}" IS NOT NULL`).join(' AND ');
          await query(`CREATE OR REPLACE TABLE ${safeTable} AS SELECT * FROM ${safeTable} WHERE ${conditions}`);
          const after = await query(`SELECT COUNT(*) as c FROM ${safeTable}`);
          const removed = Number(before[0]?.c ?? 0) - Number(after[0]?.c ?? 0);
          return { success: true, message: `Dropped ${removed} rows containing missing values.` };
        }
        return { success: false, error: 'No columns found' };
      } else if (action === 'standardize_dates') {
        const cols = await query(`PRAGMA table_info('${tableName.replace(/'/g, "''")}')`);
        let fixedCols = 0;
        for (const col of cols) {
          const type = String(col.type).toUpperCase();
          const nameLower = col.name.toLowerCase();
          const isDateCandidate = type.includes('DATE') || type.includes('TIMESTAMP') || nameLower.includes('date') || nameLower.includes('time') || nameLower.includes('day') || nameLower.includes('created') || nameLower.includes('updated');

          if (isDateCandidate || type.includes('VARCHAR')) {
            try {
              const escCol = `"${col.name.replace(/"/g, '""')}"`;
              const test = await query(`SELECT COUNT(*) as c FROM ${safeTable} WHERE COALESCE(try_cast(${escCol} as DATE), try_strptime(${escCol}, '%m/%d/%Y'), try_strptime(${escCol}, '%d/%m/%Y'), try_strptime(${escCol}, '%d-%m-%Y'), try_strptime(${escCol}, '%b %d, %Y'), try_strptime(${escCol}, '%d-%b-%Y'), try_strptime(${escCol}, '%Y/%m/%d')) IS NOT NULL`);
              const validDates = Number(test[0]?.c ?? 0);
              if (validDates > 0) {
                await query(`UPDATE ${safeTable} SET ${escCol} = strftime(COALESCE(try_cast(${escCol} as DATE), try_strptime(${escCol}, '%m/%d/%Y'), try_strptime(${escCol}, '%d/%m/%Y'), try_strptime(${escCol}, '%d-%m-%Y'), try_strptime(${escCol}, '%b %d, %Y'), try_strptime(${escCol}, '%d-%b-%Y'), try_strptime(${escCol}, '%Y/%m/%d')), '%Y-%m-%d') WHERE COALESCE(try_cast(${escCol} as DATE), try_strptime(${escCol}, '%m/%d/%Y'), try_strptime(${escCol}, '%d/%m/%Y'), try_strptime(${escCol}, '%d-%m-%Y'), try_strptime(${escCol}, '%b %d, %Y'), try_strptime(${escCol}, '%d-%b-%Y'), try_strptime(${escCol}, '%Y/%m/%d')) IS NOT NULL`);
                fixedCols++;
              }
            } catch {
              // Skip if column isn't a date
            }
          }
        }
        return { success: true, message: `Standardized date formats to YYYY-MM-DD across ${fixedCols} column(s).` };
      } else if (action === 'trim_spaces') {
        const cols = await query(`PRAGMA table_info('${tableName.replace(/'/g, "''")}')`);
        let trimmedCount = 0;
        for (const col of cols) {
          const type = String(col.type).toUpperCase();
          if (type.includes('VARCHAR') || type.includes('TEXT') || type.includes('CHAR')) {
            const escCol = `"${col.name.replace(/"/g, '""')}"`;
            await query(`UPDATE ${safeTable} SET ${escCol} = TRIM(${escCol}) WHERE ${escCol} IS NOT NULL`);
            trimmedCount++;
          }
        }
        return { success: true, message: `Trimmed extra spaces across ${trimmedCount} text columns.` };
      }
      return { success: false, error: 'Unknown cleaning action' };
    } catch (error) {
      console.error('editor:clean-data failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('editor:export-csv', async (event, tableName: string, defaultName?: string) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined;
      const saveResult = await dialog.showSaveDialog(win!, {
        title: 'Export Cleaned CSV',
        defaultPath: defaultName ? `cleaned_${defaultName.replace(/\.[^/.]+$/, '')}.csv` : 'cleaned_dataset.csv',
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      });
      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, canceled: true };
      }
      const outPath = saveResult.filePath.replace(/\\/g, '/');
      const safeTable = `"${tableName.replace(/"/g, '""')}"`;
      await query(`COPY ${safeTable} TO '${outPath}' (HEADER, DELIMITER ',')`);
      return { success: true, filePath: outPath };
    } catch (error) {
      console.error('editor:export-csv failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  /* ── Undo: restore the table from the latest snapshot ── */
  ipcMain.handle('editor:undo', async (_event, tableName: string) => {
    try {
      const snapshotName = await getLatestSnapshot(query, tableName);
      if (!snapshotName) {
        return { success: false, error: 'No undo history available' };
      }
      // Overwrite the current table with snapshot data, then drop the consumed snapshot.
      console.log(`[undo] restoring ${tableName} from ${snapshotName}`);
      await query(`CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM "${snapshotName}"`);
      await query(`DROP TABLE IF EXISTS "${snapshotName}"`);
      console.log(`[undo] restore complete`);
      return { success: true, message: 'Undo successful' };
    } catch (error) {
      console.error('editor:undo failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  /* ── Undo status: check if undo is available ── */
  ipcMain.handle('editor:undo-status', async (_event, tableName: string) => {
    try {
      const status = await getUndoStatus(query, tableName);
      return { success: true, ...status };
    } catch (error) {
      console.error('editor:undo-status failed:', error);
      return { success: false, canUndo: false, snapshotCount: 0, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
