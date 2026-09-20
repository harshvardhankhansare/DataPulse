import { useState } from 'react';
import { TableSchema, ColumnType } from '@core/schema/schemaTypes';

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  [ColumnType.NUMERIC]:      { color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.15)' },
  [ColumnType.CATEGORICAL]:  { color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.15)' },
  [ColumnType.DATE]:         { color: '#34d399', bg: 'rgba(52, 211, 153, 0.15)' },
  [ColumnType.BOOLEAN]:      { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)' },
  [ColumnType.TEXT]:         { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' },
  [ColumnType.IDENTIFIER]:   { color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)' },
};

export default function SchemaTable({ schema }: { schema: TableSchema }) {
  const [filterText, setFilterText] = useState('');

  const filteredColumns = schema.columns.filter(col =>
    col.name.toLowerCase().includes(filterText.toLowerCase()) ||
    col.detectedType.toLowerCase().includes(filterText.toLowerCase()) ||
    col.duckdbType.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div className="dp-card" style={{ marginTop: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
            Schema — <span style={{ fontFamily: 'monospace', color: '#60a5fa' }}>{schema.tableName}</span>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
            {schema.columns.length} columns detected &amp; classified
          </div>
        </div>

        {schema.columns.length > 4 && (
          <input
            type="text"
            placeholder="Search columns…"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            style={{
              padding: '6px 12px', fontSize: 12, border: '1px solid #1e293b',
              background: '#141c2e', color: '#f8fafc',
              borderRadius: 6, outline: 'none', width: 190,
            }}
          />
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #1e293b' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#0d1322', borderBottom: '1px solid #1e293b' }}>
              {['Column Name', 'Detected Type', 'DuckDB Type', 'Distinct', 'Nulls', 'Sample Values'].map((h, i) => (
                <th key={h} style={{
                  padding: '10px 12px',
                  textAlign: i >= 3 && i <= 4 ? 'right' : 'left',
                  fontSize: 10, fontWeight: 700, color: '#94a3b8',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredColumns.map((col, idx) => {
              const tc = TYPE_COLORS[col.detectedType] || { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' };
              return (
                <tr key={col.name} style={{
                  background: idx % 2 === 0 ? '#111726' : '#0e1422',
                  borderBottom: '1px solid #1a2234',
                  transition: 'background 0.1s',
                }}>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#f1f5f9', fontSize: 12 }}>
                    {col.name}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                      color: tc.color, background: tc.bg,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {col.detectedType}
                    </span>
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>
                    {col.duckdbType}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
                    {col.distinctCount.toLocaleString()}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: col.nullCount > 0 ? 700 : 400, color: col.nullCount > 0 ? '#fbbf24' : '#64748b' }}>
                    {col.nullCount.toLocaleString()}
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {col.sampleValues && col.sampleValues.length > 0
                      ? col.sampleValues.slice(0, 3).map(v => JSON.stringify(v)).join(', ')
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

