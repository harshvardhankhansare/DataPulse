import { ipcMain, dialog, BrowserWindow } from 'electron';

export function registerEditorHandlers(query: (sql: string) => Promise<any[]>) {
  ipcMain.handle('editor:get-table-rows', async (_event, tableName: string, limit = 50, offset = 0, search = '') => {
    try {
      // Get total count
      const countRes = await query(`SELECT COUNT(*) as total FROM ${tableName}`);
      const totalCount = Number(countRes[0]?.total ?? 0);

      // Columns list
      const colRes = await query(`PRAGMA table_info('${tableName}')`);
      const columns = colRes.map((c: any) => c.name);

      let sql = `SELECT rowid, * FROM ${tableName}`;
      if (search && search.trim()) {
        const cleanSearch = search.trim().replace(/'/g, "''");
        const matchConditions = columns.map((col: string) => `CAST("${col}" AS VARCHAR) ILIKE '%${cleanSearch}%'`);
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
      const safeCol = column.replace(/"/g, '""');
      let valSql = 'NULL';
      if (value !== null && value !== undefined && value !== '') {
        if (typeof value === 'number') {
          valSql = String(value);
        } else {
          valSql = `'${String(value).replace(/'/g, "''")}'`;
        }
      }
      await query(`UPDATE ${tableName} SET "${safeCol}" = ${valSql} WHERE rowid = ${Number(rowid)}`);
      return { success: true };
    } catch (error) {
      console.error('editor:update-cell failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('editor:delete-row', async (_event, tableName: string, rowid: number) => {
    try {
      await query(`DELETE FROM ${tableName} WHERE rowid = ${Number(rowid)}`);
      return { success: true };
    } catch (error) {
      console.error('editor:delete-row failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('editor:clean-data', async (_event, tableName: string, action: string) => {
    try {
      if (action === 'remove_duplicates') {
        const before = await query(`SELECT COUNT(*) as c FROM ${tableName}`);
        await query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT DISTINCT * FROM ${tableName}`);
        const after = await query(`SELECT COUNT(*) as c FROM ${tableName}`);
        const removed = Number(before[0]?.c ?? 0) - Number(after[0]?.c ?? 0);
        return { success: true, message: `Removed ${removed} duplicate rows.` };
      } else if (action === 'fill_nulls_zero') {
        const cols = await query(`PRAGMA table_info('${tableName}')`);
        let filledCount = 0;
        for (const col of cols) {
          const type = String(col.type).toUpperCase();
          if (type.includes('INT') || type.includes('DOUBLE') || type.includes('FLOAT') || type.includes('DECIMAL') || type.includes('NUMERIC') || type.includes('BIGINT')) {
            await query(`UPDATE ${tableName} SET "${col.name}" = 0 WHERE "${col.name}" IS NULL`);
            filledCount++;
          }
        }
        return { success: true, message: `Replaced empty values with 0 in ${filledCount} numeric columns.` };
      } else if (action === 'fill_nulls_mean') {
        const cols = await query(`PRAGMA table_info('${tableName}')`);
        let filledCount = 0;
        for (const col of cols) {
          const type = String(col.type).toUpperCase();
          if (type.includes('INT') || type.includes('DOUBLE') || type.includes('FLOAT') || type.includes('DECIMAL') || type.includes('NUMERIC') || type.includes('BIGINT')) {
            const avgRes = await query(`SELECT ROUND(AVG("${col.name}"), 2) as avg_val FROM ${tableName} WHERE "${col.name}" IS NOT NULL`);
            const avgVal = avgRes[0]?.avg_val;
            if (avgVal !== null && avgVal !== undefined) {
              await query(`UPDATE ${tableName} SET "${col.name}" = ${avgVal} WHERE "${col.name}" IS NULL`);
              filledCount++;
            }
          }
        }
        return { success: true, message: `Filled missing numbers with column average in ${filledCount} columns.` };
      } else if (action === 'fill_nulls_median') {
        const cols = await query(`PRAGMA table_info('${tableName}')`);
        let filledCount = 0;
        for (const col of cols) {
          const type = String(col.type).toUpperCase();
          if (type.includes('INT') || type.includes('DOUBLE') || type.includes('FLOAT') || type.includes('DECIMAL') || type.includes('NUMERIC') || type.includes('BIGINT')) {
            const medRes = await query(`SELECT MEDIAN("${col.name}") as med_val FROM ${tableName} WHERE "${col.name}" IS NOT NULL`);
            const medVal = medRes[0]?.med_val;
            if (medVal !== null && medVal !== undefined) {
              await query(`UPDATE ${tableName} SET "${col.name}" = ${medVal} WHERE "${col.name}" IS NULL`);
              filledCount++;
            }
          }
        }
        return { success: true, message: `Filled missing numbers with column median in ${filledCount} columns.` };
      } else if (action === 'fill_nulls_mode') {
        const cols = await query(`PRAGMA table_info('${tableName}')`);
        let filledCount = 0;
        for (const col of cols) {
          const type = String(col.type).toUpperCase();
          if (type.includes('VARCHAR') || type.includes('TEXT') || type.includes('CHAR')) {
            const modeRes = await query(`SELECT "${col.name}" as mode_val, COUNT(*) as cnt FROM ${tableName} WHERE "${col.name}" IS NOT NULL GROUP BY "${col.name}" ORDER BY cnt DESC LIMIT 1`);
            const modeVal = modeRes[0]?.mode_val;
            if (modeVal !== null && modeVal !== undefined) {
              const safeVal = String(modeVal).replace(/'/g, "''");
              await query(`UPDATE ${tableName} SET "${col.name}" = '${safeVal}' WHERE "${col.name}" IS NULL OR "${col.name}" = ''`);
              filledCount++;
            }
          }
        }
        return { success: true, message: `Filled empty text cells with most common value in ${filledCount} columns.` };
      } else if (action === 'drop_null_rows') {
        const before = await query(`SELECT COUNT(*) as c FROM ${tableName}`);
        const cols = await query(`PRAGMA table_info('${tableName}')`);
        if (cols.length > 0) {
          const conditions = cols.map((c: any) => `"${c.name}" IS NOT NULL`).join(' AND ');
          await query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM ${tableName} WHERE ${conditions}`);
          const after = await query(`SELECT COUNT(*) as c FROM ${tableName}`);
          const removed = Number(before[0]?.c ?? 0) - Number(after[0]?.c ?? 0);
          return { success: true, message: `Dropped ${removed} rows containing missing values.` };
        }
        return { success: false, error: 'No columns found' };
      } else if (action === 'standardize_dates') {
        const cols = await query(`PRAGMA table_info('${tableName}')`);
        let fixedCols = 0;
        for (const col of cols) {
          const type = String(col.type).toUpperCase();
          // Check if column has date in name or is varchar/date
          const nameLower = col.name.toLowerCase();
          const isDateCandidate = type.includes('DATE') || type.includes('TIMESTAMP') || nameLower.includes('date') || nameLower.includes('time') || nameLower.includes('day') || nameLower.includes('created') || nameLower.includes('updated');
          
          if (isDateCandidate || type.includes('VARCHAR')) {
            try {
              // Test if column has parseable dates
              const test = await query(`SELECT COUNT(*) as c FROM ${tableName} WHERE COALESCE(try_cast("${col.name}" as DATE), try_strptime("${col.name}", '%m/%d/%Y'), try_strptime("${col.name}", '%d/%m/%Y'), try_strptime("${col.name}", '%d-%m-%Y'), try_strptime("${col.name}", '%b %d, %Y'), try_strptime("${col.name}", '%d-%b-%Y'), try_strptime("${col.name}", '%Y/%m/%d')) IS NOT NULL`);
              const validDates = Number(test[0]?.c ?? 0);
              if (validDates > 0) {
                await query(`UPDATE ${tableName} SET "${col.name}" = strftime(COALESCE(try_cast("${col.name}" as DATE), try_strptime("${col.name}", '%m/%d/%Y'), try_strptime("${col.name}", '%d/%m/%Y'), try_strptime("${col.name}", '%d-%m-%Y'), try_strptime("${col.name}", '%b %d, %Y'), try_strptime("${col.name}", '%d-%b-%Y'), try_strptime("${col.name}", '%Y/%m/%d')), '%Y-%m-%d') WHERE COALESCE(try_cast("${col.name}" as DATE), try_strptime("${col.name}", '%m/%d/%Y'), try_strptime("${col.name}", '%d/%m/%Y'), try_strptime("${col.name}", '%d-%m-%Y'), try_strptime("${col.name}", '%b %d, %Y'), try_strptime("${col.name}", '%d-%b-%Y'), try_strptime("${col.name}", '%Y/%m/%d')) IS NOT NULL`);
                fixedCols++;
              }
            } catch {
              // Skip if column isn't a date
            }
          }
        }
        return { success: true, message: `Standardized date formats to YYYY-MM-DD across ${fixedCols} column(s).` };
      } else if (action === 'trim_spaces') {
        const cols = await query(`PRAGMA table_info('${tableName}')`);
        let trimmedCount = 0;
        for (const col of cols) {
          const type = String(col.type).toUpperCase();
          if (type.includes('VARCHAR') || type.includes('TEXT') || type.includes('CHAR')) {
            await query(`UPDATE ${tableName} SET "${col.name}" = TRIM("${col.name}") WHERE "${col.name}" IS NOT NULL`);
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
      await query(`COPY ${tableName} TO '${outPath}' (HEADER, DELIMITER ',')`);
      return { success: true, filePath: outPath };
    } catch (error) {
      console.error('editor:export-csv failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
