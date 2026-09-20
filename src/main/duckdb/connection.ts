import duckdb from 'duckdb';

let db: duckdb.Database | null = null;
let connection: duckdb.Connection | null = null;

/**
 * Recursively normalize DuckDB row values to JSON-safe types.
 * DuckDB returns BigInt for INTEGER/BIGINT columns; JSON.stringify rejects BigInt.
 * We convert BigInt → number (safe for counts/IDs up to 2^53-1).
 * Date objects → ISO string. Nested arrays/objects are handled recursively.
 */
function normalizeValue(val: unknown): unknown {
  if (typeof val === 'bigint') {
    // Safe for values up to Number.MAX_SAFE_INTEGER (~9 quadrillion)
    return Number(val);
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (Array.isArray(val)) {
    return val.map(normalizeValue);
  }
  if (val !== null && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = normalizeValue(v);
    }
    return out;
  }
  return val;
}

function normalizeRows(rows: unknown[]): unknown[] {
  return rows.map(row => normalizeValue(row)) as unknown[];
}

export function initDuckDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create an in-memory DuckDB database
    db = new duckdb.Database(':memory:', (err) => {
      if (err) {
        reject(new Error(`Failed to initialize DuckDB: ${err.message}`));
        return;
      }

      // Create a connection to the database
      connection = db!.connect();
      console.log('DuckDB initialized successfully');
      resolve();
    });
  });
}

export function query(sql: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (!connection) {
      reject(new Error('DuckDB connection not initialized'));
      return;
    }

    connection.all(sql, (err, rows) => {
      if (err) {
        reject(new Error(`Query failed: ${err.message}\nSQL: ${sql}`));
        return;
      }
      resolve(normalizeRows(rows) as any[]);
    });
  });
}

export function closeDuckDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!connection || !db) {
      resolve();
      return;
    }

    connection.close((err) => {
      if (err) {
        reject(new Error(`Failed to close connection: ${err.message}`));
        return;
      }

      db!.close((err) => {
        if (err) {
          reject(new Error(`Failed to close database: ${err.message}`));
          return;
        }

        db = null;
        connection = null;
        console.log('DuckDB closed successfully');
        resolve();
      });
    });
  });
}
