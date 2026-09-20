import { useState, useEffect } from 'react';
import { TableSchema } from '@core/schema/schemaTypes';
import { QualityReport } from '@core/profiler/profilerTypes';
import { Insight } from '@core/insights/insightTypes';
import { ExecutiveBriefing } from '@core/reporting/reportingTypes';

interface ExecutiveBriefingPanelProps {
  schema: TableSchema;
  quality: QualityReport | null;
  insights: Insight[];
  fileName?: string | null;
}

export default function ExecutiveBriefingPanel({
  schema,
  quality,
  insights,
  fileName,
}: ExecutiveBriefingPanelProps) {
  const [briefing, setBriefing] = useState<ExecutiveBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingHtml, setExportingHtml] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    async function loadBriefing() {
      if (!window.electron?.generateBriefing) return;
      setLoading(true);
      try {
        const res = await window.electron.generateBriefing(
          schema.tableName,
          fileName || undefined,
          quality,
          insights
        );
        if (res.success && res.briefing) {
          setBriefing(res.briefing);
        }
      } catch (err) {
        console.error('Failed to generate executive briefing:', err);
      } finally {
        setLoading(false);
      }
    }
    loadBriefing();
  }, [schema.tableName, fileName, quality, insights]);

  const handleExportHtml = async () => {
    if (!briefing || !window.electron?.exportBriefingHtml) return;
    setExportingHtml(true);
    setExportMessage(null);
    try {
      const res = await window.electron.exportBriefingHtml(briefing);
      if (res.success && res.filePath) {
        setExportMessage({
          text: `Interactive HTML bundle successfully exported to: ${res.filePath}`,
          type: 'success',
        });
      }
    } catch (err: any) {
      setExportMessage({ text: `HTML export failed: ${err.message}`, type: 'error' });
    } finally {
      setExportingHtml(false);
    }
  };

  const handleExportPdf = async () => {
    if (!window.electron?.exportBriefingPdf) return;
    setExportingPdf(true);
    setExportMessage(null);
    try {
      const res = await window.electron.exportBriefingPdf(briefing?.datasetName || fileName || 'Report');
      if (res.success && res.filePath) {
        setExportMessage({
          text: `Corporate PDF report successfully generated at: ${res.filePath}`,
          type: 'success',
        });
      }
    } catch (err: any) {
      setExportMessage({ text: `PDF export failed: ${err.message}`, type: 'error' });
    } finally {
      setExportingPdf(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 24, marginBottom: 12 }}>📑</div>
        <div>Synthesizing C-suite executive briefing and KPI scorecards…</div>
      </div>
    );
  }

  if (!briefing) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>
        Unable to synthesize briefing for this dataset.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Action Bar */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <span
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '2px 9px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              🛡️ C-SUITE EXECUTIVE BRIEFING DECK
            </span>
            <h2 style={{ margin: '8px 0 4px', fontSize: 22, fontWeight: 800, color: '#f8fafc' }}>
              {briefing.title}
            </h2>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              Synthesized for <b>{briefing.datasetName}</b> · Generated {briefing.generatedDate}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={handleExportHtml}
              disabled={exportingHtml}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
              }}
            >
              <span>🌐</span>
              <span>{exportingHtml ? 'Exporting…' : 'Export Interactive HTML'}</span>
            </button>

            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#f8fafc',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              <span>📑</span>
              <span>{exportingPdf ? 'Generating…' : 'Export Corporate PDF'}</span>
            </button>

            <button
              onClick={() => window.print()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 14px',
                background: 'transparent',
                color: '#94a3b8',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              <span>🖨️</span>
              <span>Print</span>
            </button>
          </div>
        </div>

        {exportMessage && (
          <div
            style={{
              marginTop: 16,
              background: exportMessage.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${exportMessage.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              borderRadius: 8,
              padding: '10px 16px',
              fontSize: 13,
              color: exportMessage.type === 'success' ? '#34d399' : '#f87171',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>{exportMessage.type === 'success' ? '✓' : '⚠️'}</span>
            <span>{exportMessage.text}</span>
          </div>
        )}
      </div>

      {/* Macro KPI Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {briefing.macroKpis.map((kpi, idx) => (
          <div key={idx} style={cardStyle}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', margin: '8px 0 4px', fontFamily: 'monospace' }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {kpi.description}
            </div>
          </div>
        ))}
      </div>

      {/* Executive Summary Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(15,23,42,0.95) 100%)',
          border: '1px solid rgba(37,99,235,0.3)',
          borderRadius: 12,
          padding: '22px 24px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}
      >
        <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>
          Executive Narrative & Operational Scope
        </h3>
        <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1', lineHeight: 1.7 }}>
          {briefing.executiveSummary}
        </p>
      </div>

      {/* Strategic Findings & Operational Variance (2 columns) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
        {/* Strategic Findings */}
        <div style={cardStyle}>
          <div style={{ marginBottom: 12 }}>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
              {briefing.strategicFindings.title}
            </h4>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {briefing.strategicFindings.subtitle}
            </div>
          </div>
          <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 14 }}>
            {briefing.strategicFindings.narrative}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#e2e8f0', fontSize: 13, lineHeight: 1.6 }}>
            {briefing.strategicFindings.bulletPoints.map((pt, idx) => (
              <li key={idx} style={{ marginBottom: 6 }}>{pt}</li>
            ))}
          </ul>
        </div>

        {/* Operational Variance */}
        <div style={cardStyle}>
          <div style={{ marginBottom: 12 }}>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
              {briefing.operationalVariance.title}
            </h4>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {briefing.operationalVariance.subtitle}
            </div>
          </div>
          <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 14 }}>
            {briefing.operationalVariance.narrative}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#e2e8f0', fontSize: 13, lineHeight: 1.6 }}>
            {briefing.operationalVariance.bulletPoints.map((pt, idx) => (
              <li key={idx} style={{ marginBottom: 6 }}>{pt}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Strategic Action Recommendations */}
      <div style={cardStyle}>
        <div style={{ marginBottom: 14 }}>
          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
            Actionable Strategic Directives
          </h4>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
            Empirically grounded next steps prioritized for executive leadership
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {briefing.actionableDecisions.map((decision, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 8,
                padding: '14px 16px',
                display: 'flex',
                gap: 10,
                fontSize: 13,
                color: '#e2e8f0',
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: '#38bdf8', fontWeight: 800, fontSize: 14 }}>#{idx + 1}</span>
              <span>{decision}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Governance & Privacy Statement */}
      <div style={{ ...cardStyle, borderLeft: '4px solid #10b981' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>🛡️</span>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
            {briefing.governanceAndPrivacy.title}
          </h4>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, margin: '0 0 10px' }}>
          {briefing.governanceAndPrivacy.narrative}
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {briefing.governanceAndPrivacy.bulletPoints.map((bp, idx) => (
            <span
              key={idx}
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                padding: '3px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              ✓ {bp}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#111827',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 12,
  padding: 20,
};
