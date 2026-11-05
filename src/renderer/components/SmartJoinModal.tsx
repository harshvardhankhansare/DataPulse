import { useState } from 'react';
import {
  LakehouseTable,
  JoinCandidate,
  JoinPlan,
  JoinType,
  JoinViewResult,
} from '@core/lakehouse/lakehouseTypes';

type SmartJoinModalProps = {
  tables: LakehouseTable[];
  candidates: JoinCandidate[];
  onCancel: () => void;
  onJoinComplete: (result: JoinViewResult, blendName: string) => void;
};

export default function SmartJoinModal({
  tables,
  candidates,
  onCancel,
  onJoinComplete,
}: SmartJoinModalProps) {
  const [leftTable, setLeftTable] = useState<string>(
    candidates[0]?.leftTable || tables[0]?.tableName || ''
  );
  const [rightTable, setRightTable] = useState<string>(
    candidates[0]?.rightTable || tables[1]?.tableName || ''
  );
  const [leftColumn, setLeftColumn] = useState<string>(candidates[0]?.leftColumn || '');
  const [rightColumn, setRightColumn] = useState<string>(candidates[0]?.rightColumn || '');
  const [joinType, setJoinType] = useState<JoinType>(candidates[0]?.recommendedJoinType || 'LEFT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leftTableObj = tables.find(t => t.tableName === leftTable) || tables[0];
  const rightTableObj = tables.find(t => t.tableName === rightTable) || tables[1];

  const handleApplyCandidate = (c: JoinCandidate) => {
    setLeftTable(c.leftTable);
    setRightTable(c.rightTable);
    setLeftColumn(c.leftColumn);
    setRightColumn(c.rightColumn);
    setJoinType(c.recommendedJoinType);
  };

  const handleCreateJoin = async () => {
    if (!leftTable || !rightTable || !leftColumn || !rightColumn) {
      setError('Please select valid left and right tables and join keys.');
      return;
    }

    setLoading(true);
    setError(null);

    const plan: JoinPlan = {
      leftTable,
      rightTable,
      leftColumn,
      rightColumn,
      joinType,
      viewName: 'unified_lakehouse',
    };

    try {
      const res = await window.electron.createJoinView(plan);
      if (res.success) {
        onJoinComplete(res, `Lakehouse (${leftTableObj.fileName} + ${rightTableObj.fileName})`);
      } else {
        setError(res.error || 'Failed to create relational view in DuckDB');
      }
    } catch (err: any) {
      setError(err.message || 'Error executing relational join');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
      }}
    >
      <div
        style={{
          background: '#0f172a',
          border: '1px solid rgba(37, 99, 235, 0.4)',
          borderRadius: 14,
          padding: 24,
          maxWidth: 680,
          width: '92%',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>🔀</span>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>
                Offline Lakehouse: Smart Relational Auto-Join
              </h3>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
              Detected {tables.length} tables in memory. Blend them into a unified in-memory analytical view.
            </p>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: 18,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Loaded Tables Pills */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {tables.map(t => (
            <div
              key={t.tableName}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                color: '#cbd5e1',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 700, color: '#60a5fa' }}>{t.fileName}</span>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                ({t.rowCount.toLocaleString()} rows · {t.format.toUpperCase()})
              </span>
            </div>
          ))}
        </div>

        {/* Recommended Candidate Banner */}
        {candidates.length > 0 && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(15, 23, 42, 0.6) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 10,
              padding: '12px 16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: '#34d399', fontWeight: 700 }}>
                ✨ AUTO-DETECTED RELATIONAL RELATIONSHIP
              </div>
              <span
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {candidates[0].overlapPct}% Key Overlap
              </span>
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span><b>{candidates[0].leftTable}</b>.{candidates[0].leftColumn}</span>
              <span style={{ color: '#60a5fa' }}>⇄</span>
              <span><b>{candidates[0].rightTable}</b>.{candidates[0].rightColumn}</span>
              <button
                onClick={() => handleApplyCandidate(candidates[0])}
                style={{
                  marginLeft: 'auto',
                  background: '#059669',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Apply Recommendation
              </button>
            </div>
          </div>
        )}

        {/* Visual Join Configuration */}
        <div
          style={{
            background: '#111827',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 10,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
            {/* Left Table & Key */}
            <div>
              <label style={labelStyle}>LEFT TABLE & PRIMARY KEY</label>
              <select
                value={leftTable}
                onChange={e => setLeftTable(e.target.value)}
                style={selectStyle}
              >
                {tables.map(t => (
                  <option key={t.tableName} value={t.tableName}>
                    {t.fileName} ({t.tableName})
                  </option>
                ))}
              </select>

              <select
                value={leftColumn}
                onChange={e => setLeftColumn(e.target.value)}
                style={{ ...selectStyle, marginTop: 8 }}
              >
                <option value="">-- Select Join Key --</option>
                {leftTableObj?.columns.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Join Type Pill */}
            <div style={{ textAlign: 'center', padding: '0 8px' }}>
              <label style={labelStyle}>JOIN TYPE</label>
              <select
                value={joinType}
                onChange={e => setJoinType(e.target.value as JoinType)}
                style={{
                  ...selectStyle,
                  fontWeight: 700,
                  color: '#60a5fa',
                  textAlign: 'center',
                }}
              >
                <option value="LEFT">LEFT JOIN</option>
                <option value="INNER">INNER JOIN</option>
                <option value="FULL">FULL OUTER</option>
              </select>
            </div>

            {/* Right Table & Key */}
            <div>
              <label style={labelStyle}>RIGHT TABLE & FOREIGN KEY</label>
              <select
                value={rightTable}
                onChange={e => setRightTable(e.target.value)}
                style={selectStyle}
              >
                {tables.map(t => (
                  <option key={t.tableName} value={t.tableName}>
                    {t.fileName} ({t.tableName})
                  </option>
                ))}
              </select>

              <select
                value={rightColumn}
                onChange={e => setRightColumn(e.target.value)}
                style={{ ...selectStyle, marginTop: 8 }}
              >
                <option value="">-- Select Join Key --</option>
                {rightTableObj?.columns.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#f87171',
              fontSize: 13,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 16px',
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Cancel
          </button>

          <button
            onClick={handleCreateJoin}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 22px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
            }}
          >
            <span>🔀</span>
            <span>{loading ? 'Creating Relational View…' : 'Blend & Launch Lakehouse Analytics'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: '#94a3b8',
  fontWeight: 700,
  letterSpacing: '0.04em',
  marginBottom: 6,
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  background: '#1e293b',
  color: '#f8fafc',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 12,
  cursor: 'pointer',
};
