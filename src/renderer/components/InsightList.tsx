import { useState } from 'react';
import { Insight, InsightType, ConfidenceLevel } from '@core/insights/insightTypes';

const TYPE_CONFIG: Record<InsightType, { label: string; stripe: string; bg: string }> = {
  trend:       { label: 'Trend',       stripe: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  comparison:  { label: 'Comparison',  stripe: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  correlation: { label: 'Correlation', stripe: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  outlier:     { label: 'Outlier',     stripe: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  summary:     { label: 'Summary',     stripe: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
};

const CONF_CONFIG: Record<ConfidenceLevel, { label: string; color: string }> = {
  high:   { label: 'High',   color: '#34d399' },
  medium: { label: 'Medium', color: '#fbbf24' },
  low:    { label: 'Low',    color: '#94a3b8' },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={copy}
      style={{
        padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
        background: copied ? '#064e3b' : '#161d26', color: copied ? '#34d399' : '#60a5fa',
        border: `1px solid ${copied ? '#065f46' : '#2d4a6a'}`,
        cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
      }}
    >
      {copied ? '✓ Copied' : 'Copy SQL'}
    </button>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const tc = TYPE_CONFIG[insight.insightType] || TYPE_CONFIG.summary;
  const cc = CONF_CONFIG[insight.confidence] || CONF_CONFIG.low;

  return (
    <div className="dp-insight-card">
      <div className="dp-insight-stripe" style={{ background: tc.stripe }} />
      <div className="dp-insight-body">
        {/* Tag row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700,
              letterSpacing: '0.05em', textTransform: 'uppercase',
              background: tc.bg, color: tc.stripe, border: `1px solid ${tc.stripe}44`,
            }}>{tc.label}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: cc.color }}>
              · {cc.label} confidence
            </span>
          </div>
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            style={{
              fontSize: 11, fontWeight: 600, color: '#60a5fa',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 0', whiteSpace: 'nowrap',
            }}
          >
            {showEvidence ? 'Hide SQL ▲' : 'View SQL ▼'}
          </button>
        </div>

        {/* Insight text */}
        <p style={{ fontSize: 13, color: '#f1f5f9', lineHeight: 1.55, margin: 0 }}>
          {insight.text}
        </p>

        {/* Evidence drawer */}
        {showEvidence && (
          <div className="dp-fadein" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                DuckDB Evidence Query
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
                  {insight.sourceColumns.join(', ')}
                </span>
                <CopyButton text={insight.evidenceQuery} />
              </div>
            </div>
            <div className="dp-code">{insight.evidenceQuery}</div>
            <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, fontStyle: 'italic' }}>
              Fully verifiable and reproducible in the DuckDB in-memory engine
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InsightList({ insights }: { insights: Insight[] }) {
  if (!insights || insights.length === 0) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {insights.map(insight => (
        <InsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  );
}

