import { useEffect } from 'react';
import { useAppStore, TabId } from './store/useAppStore';
import ImportPanel from './components/ImportPanel';
import {
  OverviewTab,
  AnalyticsTab,
  SimulationTab,
  DiagnosticTab,
  InsightsTab,
  BriefingTab,
  PrivacyTab,
  AiTab,
} from './components/TabPanels';
import { AiStatusDot, EmptyState } from './components/common';
import {
  IconBriefcase,
  IconBrain,
  IconShield,
  IconGrid,
  IconBarChart,
  IconSliders,
  IconLightbulb,
  IconCpu,
  IconFile,
  IconPrint,
} from './components/icons';

const NAV_ITEMS: { id: TabId; label: string; Icon: React.FC }[] = [
  { id: 'overview', label: 'Data & Editor', Icon: IconGrid },
  { id: 'analytics', label: 'Visual Charts', Icon: IconBarChart },
  { id: 'simulation', label: 'What-If Calculator', Icon: IconSliders },
  { id: 'diagnostic', label: 'Problem Finder', Icon: IconBrain },
  { id: 'insights', label: 'Key Findings', Icon: IconLightbulb },
  { id: 'briefing', label: 'Summary Report', Icon: IconBriefcase },
  { id: 'privacy', label: 'Hide Sensitive Info', Icon: IconShield },
  { id: 'ai', label: 'Ask AI (Plain English)', Icon: IconCpu },
];

function App() {
  const schema = useAppStore(s => s.schema);
  const applicableAnalyses = useAppStore(s => s.applicableAnalyses);
  const charts = useAppStore(s => s.charts);
  const insights = useAppStore(s => s.insights);
  const fileName = useAppStore(s => s.fileName);
  const activeTab = useAppStore(s => s.activeTab);
  const activeFilter = useAppStore(s => s.activeFilter);
  const dataVersion = useAppStore(s => s.dataVersion);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const setActiveFilter = useAppStore(s => s.setActiveFilter);
  const runAnalytics = useAppStore(s => s.runAnalytics);

  const hasData = !!schema;

  // Re-run analytics whenever the dataset, its analyses, the active filter,
  // or the underlying table data (edits/cleaning) changes.
  useEffect(() => {
    runAnalytics();
  }, [schema, applicableAnalyses, activeFilter, dataVersion, runAnalytics]);

  return (
    <div className="dp-layout">
      {/* ── Sidebar ──────────────────────────────────── */}
      <nav className="dp-sidebar">
        {/* Brand */}
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid #1e2337', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#3b82f6" stroke="#3b82f6" strokeWidth="1" strokeLinejoin="round" />
            </svg>
            <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>
              DataPulse
            </span>
          </div>
          <div style={{ color: '#475569', fontSize: 11, marginTop: 4, marginLeft: 31 }}>
            Offline Analytics
          </div>
        </div>

        {/* Nav section */}
        <div style={{ padding: '10px 0', flex: 1 }}>
          <div style={{ color: '#3d4a5c', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '4px 16px 6px' }}>
            Workspace
          </div>
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <div
              key={id}
              className={`dp-nav-item${activeTab === id ? ' active' : ''}`}
              onClick={() => hasData && setActiveTab(id)}
              style={{ opacity: !hasData && id !== 'overview' ? 0.35 : 1, cursor: !hasData && id !== 'overview' ? 'default' : 'pointer' }}
            >
              <Icon />
              <span>{label}</span>
              {id === 'insights' && insights.length > 0 && (
                <span style={{
                  marginLeft: 'auto', background: '#3b82f6', color: '#fff',
                  borderRadius: 99, padding: '1px 6px', fontSize: 10, fontWeight: 700,
                }}>{insights.length}</span>
              )}
              {id === 'analytics' && charts.length > 0 && (
                <span style={{
                  marginLeft: 'auto', background: '#1e2440', color: '#60a5fa',
                  borderRadius: 99, padding: '1px 6px', fontSize: 10, fontWeight: 700,
                }}>{charts.length}</span>
              )}
            </div>
          ))}
        </div>

        {/* Load file button at bottom of sidebar */}
        <div style={{ padding: '12px 14px 16px', borderTop: '1px solid #1e2337', flexShrink: 0 }}>
          <ImportPanel />
        </div>
      </nav>

      {/* ── Main area ────────────────────────────────── */}
      <div className="dp-main">
        {/* Topbar */}
        <div className="dp-topbar no-print">
          {/* File chip */}
          {fileName ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#141c2e', border: '1px solid #1e293b',
              borderRadius: 6, padding: '4px 10px', fontSize: 12,
              color: '#f1f5f9', fontWeight: 500,
            }}>
              <IconFile />
              <span style={{ fontFamily: 'monospace', color: '#60a5fa' }}>{fileName}</span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: '#94a3b8' }}>No dataset loaded</span>
          )}

          {/* Active Filter Pill in Topbar */}
          {activeFilter && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(59, 130, 246, 0.15)', border: '1px solid #3b82f6',
              borderRadius: 6, padding: '3px 9px', fontSize: 11,
              color: '#93c5fd', fontWeight: 600,
            }}>
              <span>🔍 Filtered: {activeFilter.column}="{String(activeFilter.value)}"</span>
              <button
                onClick={() => setActiveFilter(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#f87171', fontSize: 12, padding: '0 2px',
                  fontWeight: 800,
                }}
                title="Clear filter"
              >
                ✕
              </button>
            </div>
          )}

          {/* AI status */}
          {hasData && (
            <AiStatusDot />
          )}

          {/* Air-Gap Verification Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: 11,
              color: '#34d399',
              fontWeight: 600,
            }}
            title="Air-Gapped: 0 outbound requests, 100% in-memory DuckDB"
          >
            <span>🛡️ Air-Gapped</span>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {hasData && (
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                {schema!.columns.length} columns · {applicableAnalyses.length} analyses
              </span>
            )}
            {hasData && (
              <button className="dp-btn dp-btn-ghost" onClick={() => window.print()}>
                <IconPrint />
                Export PDF
              </button>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="dp-content">
          {!hasData ? (
            <EmptyState />
          ) : (
            <>
              {activeTab === 'overview' && <OverviewTab />}
              {activeTab === 'analytics' && <AnalyticsTab />}
              {activeTab === 'simulation' && <SimulationTab />}
              {activeTab === 'diagnostic' && <DiagnosticTab />}
              {activeTab === 'insights' && <InsightsTab />}
              {activeTab === 'briefing' && <BriefingTab />}
              {activeTab === 'privacy' && <PrivacyTab />}
              {activeTab === 'ai' && <AiTab />}
            </>
          )}
        </div>

        {/* Print-only header */}
        <div style={{ display: 'none' }} className="print-only" aria-hidden>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 20 }}>DataPulse — Analytics Report</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{fileName} · {schema?.columns.length} columns</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>
              {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
