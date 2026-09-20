import { MaskingStrategy, PiiCategory } from './privacyTypes.js';

export function maskValueInJs(val: unknown, category: PiiCategory, strategy: MaskingStrategy): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (!str) return '';

  if (strategy === 'none') return str;
  if (strategy === 'nullify') return '[NULL]';
  if (strategy === 'redact') return '[REDACTED]';

  if (strategy === 'hash') {
    // Simple fast 8-char hash preview
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
    return `#anon_${hex}`;
  }

  // Partial strategy based on category
  switch (category) {
    case 'email': {
      const parts = str.split('@');
      if (parts.length === 2) {
        const user = parts[0];
        const domain = parts[1];
        const maskedUser = user.length <= 2 ? `${user[0] ?? '*'}***` : `${user[0]}***${user[user.length - 1]}`;
        return `${maskedUser}@${domain}`;
      }
      return `${str.slice(0, 2)}***`;
    }

    case 'phone': {
      const digits = str.replace(/\D/g, '');
      if (digits.length >= 4) {
        const last4 = digits.slice(-4);
        return `***-***-${last4}`;
      }
      return '***-***-****';
    }

    case 'credit_card': {
      const digits = str.replace(/\D/g, '');
      if (digits.length >= 4) {
        const last4 = digits.slice(-4);
        return `****-****-****-${last4}`;
      }
      return '****-****-****-****';
    }

    case 'ssn': {
      const digits = str.replace(/\D/g, '');
      if (digits.length >= 4) {
        return `***-**-${digits.slice(-4)}`;
      }
      return '***-**-****';
    }

    case 'ip_address': {
      const parts = str.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.*.*`;
      }
      return '***.***.*.*';
    }

    case 'name': {
      const parts = str.split(' ');
      return parts.map(p => (p.length > 1 ? `${p[0]}.` : p)).join(' ');
    }

    case 'financial': {
      return '$ ***,***';
    }

    default: {
      if (str.length <= 4) return '****';
      return `${str.slice(0, 2)}****${str.slice(-2)}`;
    }
  }
}

/**
 * Generates the DuckDB SQL SELECT expression for a masked column
 */
export function getDuckDbMaskingExpr(colName: string, category: PiiCategory, strategy: MaskingStrategy): string {
  const col = `"${colName.replace(/"/g, '""')}"`;
  const strCol = `CAST(${col} AS VARCHAR)`;

  if (strategy === 'none') {
    return col;
  }

  if (strategy === 'nullify') {
    return `NULL AS ${col}`;
  }

  if (strategy === 'redact') {
    return `'[REDACTED]' AS ${col}`;
  }

  if (strategy === 'hash') {
    return `CONCAT('#anon_', SUBSTR(MD5(${strCol}), 1, 8)) AS ${col}`;
  }

  // Partial masking in DuckDB SQL
  switch (category) {
    case 'email':
      return `CASE 
        WHEN ${col} IS NULL THEN NULL 
        WHEN POSITION('@' IN ${strCol}) > 0 THEN 
          CONCAT(SUBSTR(${strCol}, 1, 1), '***@', SPLIT_PART(${strCol}, '@', 2))
        ELSE '***' 
      END AS ${col}`;

    case 'phone':
      return `CASE 
        WHEN ${col} IS NULL THEN NULL 
        ELSE CONCAT('***-***-', RIGHT(REGEXP_REPLACE(${strCol}, '[^0-9]', '', 'g'), 4))
      END AS ${col}`;

    case 'credit_card':
      return `CASE 
        WHEN ${col} IS NULL THEN NULL 
        ELSE CONCAT('****-****-****-', RIGHT(REGEXP_REPLACE(${strCol}, '[^0-9]', '', 'g'), 4))
      END AS ${col}`;

    case 'ssn':
      return `CASE 
        WHEN ${col} IS NULL THEN NULL 
        ELSE CONCAT('***-**-', RIGHT(REGEXP_REPLACE(${strCol}, '[^0-9]', '', 'g'), 4))
      END AS ${col}`;

    case 'ip_address':
      return `CASE 
        WHEN ${col} IS NULL THEN NULL 
        ELSE CONCAT(SPLIT_PART(${strCol}, '.', 1), '.', SPLIT_PART(${strCol}, '.', 2), '.*.*')
      END AS ${col}`;

    case 'name':
      return `CASE 
        WHEN ${col} IS NULL THEN NULL 
        ELSE CONCAT(SUBSTR(${strCol}, 1, 1), '. ', SPLIT_PART(${strCol}, ' ', 2))
      END AS ${col}`;

    case 'financial':
      return `CASE 
        WHEN ${col} IS NULL THEN NULL 
        ELSE ROUND(CAST(${col} AS DOUBLE) / 1000.0) * 1000.0
      END AS ${col}`;

    default:
      return `CASE 
        WHEN ${col} IS NULL THEN NULL 
        ELSE CONCAT(SUBSTR(${strCol}, 1, 2), '***')
      END AS ${col}`;
  }
}

type QueryFunction = (sql: string) => Promise<any[]>;

/**
 * Creates an in-memory DuckDB VIEW on top of the raw table with masked column projections.
 */
export async function applyDatasetMasking(
  tableName: string,
  schema: { columns: { name: string }[] },
  columnRules: Record<string, { category: PiiCategory; strategy: MaskingStrategy }>,
  queryFn: QueryFunction
): Promise<{ success: boolean; isMasked: boolean }> {
  const rawTable = `_raw_${tableName}`;
  const escRaw = `"${rawTable.replace(/"/g, '""')}"`;
  const escTable = `"${tableName.replace(/"/g, '""')}"`;

  // Check if raw table already exists
  const existing = await queryFn(
    `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'main' AND table_name = '${rawTable}'`
  );

  if (existing.length === 0) {
    // Current table is the base table, rename it to rawTable
    await queryFn(`ALTER TABLE ${escTable} RENAME TO ${escRaw}`);
  }

  // Build projected columns
  const projections = schema.columns.map(col => {
    const rule = columnRules[col.name];
    if (rule && rule.strategy !== 'none') {
      return getDuckDbMaskingExpr(col.name, rule.category, rule.strategy);
    }
    return `"${col.name.replace(/"/g, '""')}"`;
  });

  // Create or replace view with the original tableName
  await queryFn(`CREATE OR REPLACE VIEW ${escTable} AS SELECT ${projections.join(', ')} FROM ${escRaw}`);

  return { success: true, isMasked: true };
}

/**
 * Reverts the in-memory view and restores the raw base table.
 */
export async function revertDatasetMasking(
  tableName: string,
  queryFn: QueryFunction
): Promise<{ success: boolean; isMasked: boolean }> {
  const rawTable = `_raw_${tableName}`;
  const escRaw = `"${rawTable.replace(/"/g, '""')}"`;
  const escTable = `"${tableName.replace(/"/g, '""')}"`;

  const existing = await queryFn(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_name = '${rawTable}'`
  );

  if (existing.length > 0) {
    await queryFn(`DROP VIEW IF EXISTS ${escTable}`);
    await queryFn(`ALTER TABLE ${escRaw} RENAME TO ${escTable}`);
  }

  return { success: true, isMasked: false };
}

