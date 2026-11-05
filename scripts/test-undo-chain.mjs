/**
 * Diagnostic: tests the FULL undo chain (snapshot → clean → undo) against real DuckDB.
 * Run: node scripts/test-undo-chain.mjs
 */
import duckdb from 'duckdb';

const db = new duckdb.Database(':memory:');
const con = db.connect();

function query(sql) {
  return new Promise((resolve, reject) => {
    con.all(sql, (err, rows) => {
      if (err) reject(new Error(`SQL failed: ${err.message}\nSQL: ${sql}`));
      else resolve(rows);
    });
  });
}

async function showTables() {
  const rows = await query('SHOW TABLES');
  return rows.map(r => r.name);
}

async function countRows(table) {
  const rows = await query(`SELECT COUNT(*) as c FROM ${table}`);
  return Number(rows[0].c);
}

async function getLatestSnapshot(tableName) {
  const tables = await showTables();
  const snapshots = tables
    .filter(n => String(n).startsWith(`${tableName}__undo_`))
    .map(n => ({ name: n, num: parseInt(n.split('__undo_')[1], 10) }))
    .sort((a, b) => b.num - a.num);
  return snapshots.length > 0 ? snapshots[0].name : null;
}

async function createSnapshot(tableName, counter) {
  const snapshotName = `${tableName}__undo_${counter}`;
  await query(`CREATE OR REPLACE TABLE ${snapshotName} AS SELECT * FROM ${tableName}`);
  return snapshotName;
}

let pass = 0;
let fail = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    pass++;
  } else {
    console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    fail++;
  }
}

async function run() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  DuckDB Undo Chain Diagnostic');
  console.log('═══════════════════════════════════════════\n');

  // ── Setup ──────────────────────────────────────────────────────────────────
  const table = 'imported_data';
  await query(`CREATE TABLE ${table} (id INTEGER, name VARCHAR, score DOUBLE)`);
  await query(`INSERT INTO ${table} VALUES
    (1, 'Alice', 90.0),
    (2, 'Bob',   80.0),
    (3, 'Alice', 90.0),   -- duplicate of row 1
    (4, 'Carol', 70.0),
    (5, 'Bob',   80.0)`); // duplicate of row 2

  console.log('── Test 1: remove_duplicates undo ──────────────────');
  {
    const before = await countRows(table);
    assert('Initial row count = 5', before === 5, `got ${before}`);

    // Step 1: create snapshot
    const snap = await createSnapshot(table, 1);
    const snapCount = await countRows(snap);
    assert(`Snapshot created: ${snap}`, true);
    assert(`Snapshot has all ${before} rows`, snapCount === before, `got ${snapCount}`);

    // Step 2: remove_duplicates
    await query(`CREATE OR REPLACE TABLE ${table} AS SELECT DISTINCT * FROM ${table}`);
    const afterDedup = await countRows(table);
    assert(`After dedup: fewer rows (got ${afterDedup})`, afterDedup < before, `got ${afterDedup}`);

    // Step 3: getUndoStatus should see the snapshot
    const tables = await showTables();
    const snapshots = tables.filter(n => n.startsWith(`${table}__undo_`));
    assert(`SHOW TABLES sees snapshot`, snapshots.length > 0, `tables: ${tables.join(', ')}`);

    // Step 4: undo using CREATE OR REPLACE + DROP
    const latestSnap = await getLatestSnapshot(table);
    assert(`getLatestSnapshot returns ${snap}`, latestSnap === snap, `got ${latestSnap}`);

    await query(`CREATE OR REPLACE TABLE ${table} AS SELECT * FROM ${latestSnap}`);
    await query(`DROP TABLE IF EXISTS ${latestSnap}`);

    const afterUndo = await countRows(table);
    assert(`After undo: rows restored to ${before}`, afterUndo === before, `got ${afterUndo}`);

    const remainingSnaps = (await showTables()).filter(n => n.startsWith(`${table}__undo_`));
    assert(`Snapshot consumed after undo`, remainingSnaps.length === 0, `remaining: ${remainingSnaps.join(', ')}`);
  }

  // ── Test 2: drop_null_rows undo ────────────────────────────────────────────
  console.log('\n── Test 2: drop_null_rows undo ─────────────────────');
  {
    await query(`DROP TABLE IF EXISTS ${table}`);
    await query(`CREATE TABLE ${table} (id INTEGER, name VARCHAR, score DOUBLE)`);
    await query(`INSERT INTO ${table} VALUES
      (1, 'Alice', 90.0),
      (2, NULL,    80.0),
      (3, 'Carol', NULL),
      (4, 'Dave',  60.0)`);

    const before = await countRows(table);
    assert(`Initial row count = 4`, before === 4, `got ${before}`);

    const snap = await createSnapshot(table, 2);
    const conditions = `"id" IS NOT NULL AND "name" IS NOT NULL AND "score" IS NOT NULL`;
    await query(`CREATE OR REPLACE TABLE ${table} AS SELECT * FROM ${table} WHERE ${conditions}`);
    const afterDrop = await countRows(table);
    assert(`After drop_null_rows: fewer rows (${afterDrop})`, afterDrop < before, `got ${afterDrop}`);

    const latestSnap = await getLatestSnapshot(table);
    await query(`CREATE OR REPLACE TABLE ${table} AS SELECT * FROM ${latestSnap}`);
    await query(`DROP TABLE IF EXISTS ${latestSnap}`);

    const afterUndo = await countRows(table);
    assert(`After undo: rows restored to ${before}`, afterUndo === before, `got ${afterUndo}`);
  }

  // ── Test 3: UPDATE-based ops undo (fill_nulls_zero, trim_spaces) ──────────
  console.log('\n── Test 3: UPDATE-based ops undo ───────────────────');
  {
    await query(`DROP TABLE IF EXISTS ${table}`);
    await query(`CREATE TABLE ${table} (id INTEGER, val DOUBLE)`);
    await query(`INSERT INTO ${table} VALUES (1, 10.0), (2, NULL), (3, 30.0)`);

    const snap = await createSnapshot(table, 3);
    await query(`UPDATE ${table} SET "val" = 0 WHERE "val" IS NULL`);
    const afterFill = (await query(`SELECT COUNT(*) as c FROM ${table} WHERE val = 0`));
    assert(`Fill null with 0 worked`, Number(afterFill[0].c) === 1);

    const latestSnap = await getLatestSnapshot(table);
    await query(`CREATE OR REPLACE TABLE ${table} AS SELECT * FROM ${latestSnap}`);
    await query(`DROP TABLE IF EXISTS ${latestSnap}`);

    const nullCount = (await query(`SELECT COUNT(*) as c FROM ${table} WHERE val IS NULL`));
    assert(`After undo: NULL restored`, Number(nullCount[0].c) === 1);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  console.log('═══════════════════════════════════════════\n');

  if (fail > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('\n💥 Unexpected error:', err.message);
  process.exit(1);
});
