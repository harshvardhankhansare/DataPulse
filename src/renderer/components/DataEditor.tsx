import { useState, useEffect, useCallback } from 'react';
import { TableSchema } from '@core/schema/schemaTypes';

interface DataEditorProps {
  schema: TableSchema;
  fileName?: string | null;
  onDataChanged?: () => void;
}

export default function DataEditor({ schema, fileName, onDataChanged }: DataEditorProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(25);
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Cell editing state
  const [editingCell, setEditingCell] = useState<{ rowid: number; column: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const loadData = useCallback(async () => {
    if (!schema?.tableName) return;
    setLoading(true);
    try {
      const res = await window.electron.getTableRows(
        schema.tableName,
        pageSize,
        page * pageSize,
        search
      );
      if (res.success && res.rows) {
        setRows(res.rows);
        setTotalCount(res.totalCount ?? 0);
        if (res.columns && res.columns.length > 0) {
          setColumns(res.columns);
        } else if (schema.columns) {
          setColumns(schema.columns.map(c => c.name));
        }
      } else if (res.error) {
        setStatusMessage({ text: `Failed to load rows: ${res.error}`, type: 'error' });
      }
    } catch (err) {
      console.error('Failed loading rows:', err);
    } finally {
      setLoading(false);
    }
  }, [schema?.tableName, page, pageSize, search, schema?.columns]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle cell double click
  const handleStartEdit = (rowid: number, column: string, currentValue: any) => {
    setEditingCell({ rowid, column });
    setEditValue(currentValue === null || currentValue === undefined ? '' : String(currentValue));
  };

  // Save edited cell
  const handleSaveEdit = async () => {
    if (!editingCell) return;
    const { rowid, column } = editingCell;
    setEditingCell(null);

    try {
      // Find original value to see if it changed
      const row = rows.find(r => r.rowid === rowid);
      if (row && String(row[column] ?? '') === editValue) {
        return; // No change
      }

      // Detect if column is numeric to parse appropriately
      const colMeta = schema.columns.find(c => c.name === column);
      let parsedVal: any = editValue;
      if (colMeta?.detectedType === 'numeric' && editValue.trim() !== '') {
        const num = Number(editValue);
        if (!isNaN(num)) parsedVal = num;
      }

      const res = await window.electron.updateCell(schema.tableName, rowid, column, parsedVal);
      if (res.success) {
        setStatusMessage({ text: `✓ Updated [${column}] successfully`, type: 'success' });
        // Optimistically update local row
        setRows(prev => prev.map(r => r.rowid === rowid ? { ...r, [column]: parsedVal } : r));
        if (onDataChanged) onDataChanged();
      } else {
        setStatusMessage({ text: `Update error: ${res.error}`, type: 'error' });
      }
    } catch (err) {
      console.error('Cell update failed:', err);
      setStatusMessage({ text: 'Failed to save cell change', type: 'error' });
    }
  };

  // Delete single row
  const handleDeleteRow = async (rowid: number) => {
    if (!window.confirm('Are you sure you want to delete this row?')) return;
    try {
      const res = await window.electron.deleteRow(schema.tableName, rowid);
      if (res.success) {
        setStatusMessage({ text: '✓ Row deleted', type: 'info' });
        loadData();
        if (onDataChanged) onDataChanged();
      } else {
        setStatusMessage({ text: `Delete error: ${res.error}`, type: 'error' });
      }
    } catch (err) {
      console.error('Row delete failed:', err);
    }
  };

  // 1-Click Data Cleaning Actions
  const handleCleanAction = async (action: 'remove_duplicates' | 'fill_nulls_zero' | 'fill_nulls_mean' | 'fill_nulls_median' | 'fill_nulls_mode' | 'drop_null_rows' | 'standardize_dates' | 'trim_spaces') => {
    try {
      setLoading(true);
      const res = await window.electron.cleanData(schema.tableName, action);
      if (res.success) {
        setStatusMessage({ text: `✓ ${res.message}`, type: 'success' });
        loadData();
        if (onDataChanged) onDataChanged();
      } else {
        setStatusMessage({ text: `Cleaning error: ${res.error}`, type: 'error' });
      }
    } catch (err) {
      console.error('Clean data failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Export cleaned CSV
  const handleExportCsv = async () => {
    try {
      const res = await window.electron.exportCleanedCsv(schema.tableName, fileName || 'data');
      if (res.success && res.filePath) {
        setStatusMessage({ text: `✓ Cleaned CSV saved: ${res.filePath}`, type: 'success' });
      }
    } catch (err) {
      console.error('Export CSV failed:', err);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="dp-card" style={{ marginTop: 0, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ─── Top Control & Cleaning Toolbar ─── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        {/* Left: Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search table rows..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              style={{
                padding: '7px 12px 7px 28px',
                fontSize: 12,
                border: '1px solid #1e293b',
                background: '#141c2e',
                color: '#f8fafc',
                borderRadius: 6,
                outline: 'none',
                width: 210,
              }}
            />
            <span style={{ position: 'absolute', left: 9, top: 7, fontSize: 11, color: '#64748b' }}>🔍</span>
          </div>

          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            Total: <strong style={{ color: '#f8fafc' }}>{totalCount.toLocaleString()}</strong> rows
          </span>
        </div>

        {/* Right: 1-Click Cleaners & Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="dp-btn dp-btn-ghost"
            style={{ padding: '6px 11px', fontSize: 11, border: '1px solid #1e293b' }}
            onClick={() => handleCleanAction('remove_duplicates')}
            title="Scan the table and delete identical duplicate rows"
          >
            🧹 Remove Duplicates
          </button>

          {/* Smart Null Fixer Dropdown */}
          <select
            defaultValue=""
            onChange={e => {
              if (e.target.value) {
                handleCleanAction(e.target.value as any);
                e.target.value = '';
              }
            }}
            style={{
              padding: '6px 10px',
              fontSize: 11,
              border: '1px solid #1e293b',
              background: '#141c2e',
              color: '#f8fafc',
              borderRadius: 6,
              outline: 'none',
              cursor: 'pointer',
            }}
            title="Choose how to fix blank or missing values"
          >
            <option value="" disabled>🩹 Fix Missing / Nulls ▾</option>
            <option value="fill_nulls_mean">Fill Numbers with Average</option>
            <option value="fill_nulls_median">Fill Numbers with Median (Outlier Safe)</option>
            <option value="fill_nulls_mode">Fill Text with Most Common</option>
            <option value="fill_nulls_zero">Fill Numbers with 0</option>
            <option value="drop_null_rows">🗑️ Delete Incomplete Rows</option>
          </select>

          {/* Date Standardizer */}
          <button
            className="dp-btn dp-btn-ghost"
            style={{ padding: '6px 11px', fontSize: 11, border: '1px solid #1e293b' }}
            onClick={() => handleCleanAction('standardize_dates')}
            title="Convert all mixed date formats (e.g. 15-Jan-2024, 01/15/2024) into standard YYYY-MM-DD"
          >
            📅 Fix Date Formats
          </button>

          <button
            className="dp-btn dp-btn-ghost"
            style={{ padding: '6px 11px', fontSize: 11, border: '1px solid #1e293b' }}
            onClick={() => handleCleanAction('trim_spaces')}
            title="Strip unnecessary leading/trailing whitespace"
          >
            ✂️ Trim Spaces
          </button>

          <button
            className="dp-btn dp-btn-primary"
            style={{ padding: '6px 14px', fontSize: 11, background: '#10b981', borderColor: '#059669', color: '#ffffff', fontWeight: 600 }}
            onClick={handleExportCsv}
            title="Download the updated, cleaned dataset as a fresh CSV file"
          >
            📥 Download Cleaned CSV
          </button>
        </div>
      </div>

      {/* ─── Feedback / Alert Banner ─── */}
      {statusMessage && (
        <div style={{
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : statusMessage.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
          border: `1px solid ${statusMessage.type === 'success' ? '#10b981' : statusMessage.type === 'error' ? '#ef4444' : '#3b82f6'}`,
          color: statusMessage.type === 'success' ? '#34d399' : statusMessage.type === 'error' ? '#f87171' : '#93c5fd',
        }}>
          <span>{statusMessage.text}</span>
          <button
            onClick={() => setStatusMessage(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Data Grid ─── */}
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #1e293b', maxHeight: 520 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, position: 'relative' }}>
          <thead>
            <tr style={{ background: '#0d1322', borderBottom: '1px solid #1e293b', position: 'sticky', top: 0, zIndex: 2 }}>
              <th style={{ padding: '10px 10px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#64748b', width: 44 }}>
                #
              </th>
              {columns.map(col => (
                <th key={col} style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#94a3b8',
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                }}>
                  {col}
                </th>
              ))}
              <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#64748b', width: 50 }}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + 2} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                  Loading rows from DuckDB...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                  No matching rows found
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const rowid = Number(row.rowid ?? idx);
                return (
                  <tr
                    key={rowid}
                    style={{
                      background: idx % 2 === 0 ? '#111726' : '#0e1422',
                      borderBottom: '1px solid #1a2234',
                      transition: 'background 0.1s',
                    }}
                  >
                    {/* Row Index */}
                    <td style={{ padding: '8px 10px', textAlign: 'center', color: '#475569', fontSize: 11, fontFamily: 'monospace' }}>
                      {page * pageSize + idx + 1}
                    </td>

                    {/* Columns */}
                    {columns.map(col => {
                      const isEditing = editingCell?.rowid === rowid && editingCell?.column === col;
                      const val = row[col];
                      const isNull = val === null || val === undefined;

                      return (
                        <td
                          key={col}
                          onDoubleClick={() => handleStartEdit(rowid, col, val)}
                          title="Double-click to edit cell"
                          style={{
                            padding: '6px 10px',
                            color: isNull ? '#64748b' : '#f1f5f9',
                            fontFamily: typeof val === 'number' ? 'monospace' : 'inherit',
                            maxWidth: 240,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            backgroundColor: isEditing ? '#1e293b' : 'transparent',
                          }}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              type="text"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={handleSaveEdit}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveEdit();
                                if (e.key === 'Escape') setEditingCell(null);
                              }}
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                fontSize: 12,
                                border: '1px solid #3b82f6',
                                borderRadius: 4,
                                background: '#0b0f19',
                                color: '#ffffff',
                                outline: 'none',
                              }}
                            />
                          ) : (
                            isNull ? <span style={{ fontStyle: 'italic', opacity: 0.6 }}>null</span> : String(val)
                          )}
                        </td>
                      );
                    })}

                    {/* Delete Row button */}
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleDeleteRow(rowid)}
                        title="Delete row"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748b',
                          fontSize: 12,
                          padding: '3px 6px',
                          borderRadius: 4,
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Pagination Footer ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
            style={{
              background: '#141c2e',
              border: '1px solid #1e293b',
              color: '#f8fafc',
              borderRadius: 4,
              padding: '3px 6px',
              fontSize: 11,
              outline: 'none',
            }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span style={{ marginLeft: 8 }}>
            Showing {Math.min(totalCount, page * pageSize + 1)}–{Math.min(totalCount, (page + 1) * pageSize)} of {totalCount}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="dp-btn dp-btn-ghost"
            style={{ padding: '4px 10px', fontSize: 11 }}
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
          >
            ← Previous
          </button>
          <span>Page {totalPages === 0 ? 0 : page + 1} of {totalPages}</span>
          <button
            className="dp-btn dp-btn-ghost"
            style={{ padding: '4px 10px', fontSize: 11 }}
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
