import { QualityReport, QualityIssue } from '@core/profiler/profilerTypes';

type QualityCardProps = { quality: QualityReport; };

/* SVG Donut score */
function DonutScore({ score }: { score: number }) {
  const pct   = Math.round(score * 100);
  const r     = 38;
  const circ  = 2 * Math.PI * r;
  const dash  = circ * score;
  const color = score >= 0.8 ? '#22c55e' : score >= 0.6 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
      <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="48" cy="48" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{pct}%</span>
        <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 2 }}>Quality</span>
      </div>
    </div>
  );
}

function Gauge({ label, value }: { label: string; value: number }) {
  const pct   = Math.round(value * 100);
  const color = value >= 0.8 ? '#22c55e' : value >= 0.6 ? '#f59e0b' : '#ef4444';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
      </div>
      <div className="dp-gauge-track">
        <div className="dp-gauge-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

const SEVERITY_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  high:   { color: '#f87171', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)' },
  medium: { color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' },
  low:    { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.25)' },
};

export default function QualityCard({ quality }: QualityCardProps) {
  const score = quality.overallScore;
  const sorted = [...quality.issues].sort((a, b) =>
    severityRank(b.severity) - severityRank(a.severity)
  );

  return (
    <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>Data Quality</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>4-dimension profile</div>
        </div>
        <DonutScore score={score} />
      </div>

      {/* Gauges */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Gauge label="Completeness" value={quality.completeness} />
        <Gauge label="Uniqueness"   value={quality.uniqueness} />
        <Gauge label="Validity"     value={quality.validity} />
        <Gauge label="Consistency"  value={quality.consistency} />
      </div>

      {/* Issues */}
      {sorted.length > 0 ? (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
            Issues Detected ({sorted.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sorted.map((issue, idx) => {
              const s = SEVERITY_STYLE[issue.severity] || SEVERITY_STYLE.low;
              return (
                <div key={`${issue.issueType}-${issue.column}-${idx}`} style={{
                  display: 'flex', gap: 10, padding: '8px 10px',
                  background: s.bg, border: `1px solid ${s.border}`,
                  borderRadius: 6, borderLeft: `3px solid ${s.color}`,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 500 }}>{issue.description}</div>
                    {issue.suggestion && (
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{issue.suggestion}</div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: s.color,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    flexShrink: 0, alignSelf: 'flex-start', marginTop: 1,
                  }}>{issue.severity}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{
          padding: '8px 12px', background: 'rgba(34, 197, 94, 0.12)',
          border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 6,
          fontSize: 12, color: '#4ade80', fontWeight: 500,
        }}>
          No quality issues detected
        </div>
      )}
    </div>
  );
}

function severityRank(severity: QualityIssue['severity']): number {
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}



