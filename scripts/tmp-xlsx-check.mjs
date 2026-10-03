import duckdb from 'duckdb';

const db = new duckdb.Database(':memory:');
const conn = db.connect();

function query(sql) {
    return new Promise((resolve, reject) => {
        conn.all(sql, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

// 1. sheets() table function — lists sheet names
try {
    const sheets = await query(`SELECT * FROM sheets('test-data/sales.xlsx')`);
    console.log('sheets() SUCCESS:', JSON.stringify(sheets, null, 2));
} catch (e) {
    console.log('sheets() FAILED:', e.message);
}

// 2. read_xlsx with sheet name from sheets() (simulating index → name mapping)
try {
    const sheets = await query(`SELECT * FROM sheets('test-data/sales.xlsx')`);
    const firstSheet = sheets[0]?.sheet_name || sheets[0]?.name;
    console.log('first sheet name:', firstSheet);
    const rows = await query(
        `SELECT COUNT(*) AS c FROM read_xlsx('test-data/sales.xlsx', header = true, sheet = '${firstSheet}')`
    );
    console.log('read by resolved name SUCCESS:', rows[0].c);
} catch (e) {
    console.log('resolved-name read FAILED:', e.message);
}

db.close();
