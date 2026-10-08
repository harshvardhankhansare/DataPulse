/* Temporary verification of the persistence SQL flow used in persistenceHandlers.ts */
import duckdb from 'duckdb';
import fs from 'fs';

const db = new duckdb.Database(':memory:');
const conn = db.connect();
const q = (sql) => new Promise((res, rej) => conn.all(sql, (e, r) => e ? rej(e) : res(r)));

const FILE = 'scripts/tmp-persistence-check.duckdb';
if (fs.existsSync(FILE)) fs.unlinkSync(FILE);

try {
    // 1. Simulate an imported + edited table
    await q(`CREATE TABLE imported_data AS SELECT * FROM (VALUES (1, 'a'), (2, 'b'), (3, 'c')) t(id, name)`);
    await q(`UPDATE imported_data SET name = 'EDITED' WHERE id = 2`);

    // 2. Stamp metadata (same as save handler)
    await q(`CREATE OR REPLACE TABLE _datapulse_meta AS SELECT 'imported_data' AS active_table, 'sales.csv' AS file_name`);

    // 3. Save: ATTACH file db, copy from memory, detach
    await q(`ATTACH '${FILE.replace(/\\/g, '/')}' AS dp_project_save`);
    await q('COPY FROM DATABASE memory TO dp_project_save');
    await q('DETACH dp_project_save');
    await q(`DROP TABLE IF EXISTS _datapulse_meta`);
    console.log('PASS: save — file exists:', fs.existsSync(FILE), `(${fs.statSync(FILE).size} bytes)`);

    // 4. Simulate app restart: fresh in-memory DB
    const db2 = new duckdb.Database(':memory:');
    const conn2 = db2.connect();
    const q2 = (sql) => new Promise((res, rej) => conn2.all(sql, (e, r) => e ? rej(e) : res(r)));

    // 5. Load: ATTACH + COPY FROM DATABASE file TO memory
    await q2(`ATTACH '${FILE.replace(/\\/g, '/')}' AS dp_project_load`);
    await q2(`COPY FROM DATABASE dp_project_load TO memory`);
    await q2(`DETACH dp_project_load`);

    // 6. Verify metadata + edited data survived
    const meta = await q2(`SELECT active_table, file_name FROM _datapulse_meta LIMIT 1`);
    console.log('PASS: load — metadata:', JSON.stringify(meta[0]));
    const rows = await q2(`SELECT * FROM imported_data ORDER BY id`);
    console.log('PASS: load — rows:', JSON.stringify(rows));
    const edited = rows.find(r => r.id === 2);
    if (edited?.name !== 'EDITED') throw new Error('Edit did not persist!');
    console.log('PASS: edit persisted across save/load');

    // 7. Verify SHOW TABLES lists both tables (like clearInMemoryDatabase expects)
    const tables = await q2(`SHOW TABLES`);
    console.log('PASS: SHOW TABLES:', tables.map(r => r.name).join(', '));

    console.log('\nALL PERSISTENCE CHECKS PASSED');
} catch (err) {
    console.error('FAIL:', err.message);
    process.exit(1);
} finally {
    try { conn.close(); db.close(); } catch { }
    if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
}
