import { useState, useEffect } from 'react';
import { TableSchema } from '@core/schema/schemaTypes';
import { QualityReport } from '@core/profiler/profilerTypes';
import { AnalysisTask } from '@core/rules/ruleTypes';
import { ChartConfig } from '@core/charts/chartTypes';
import { Insight } from '@core/insights/insightTypes';
import { ActiveFilter } from '@core/analytics/filterTypes';
import ImportPanel from './components/ImportPanel';
import QualityCard from './components/QualityCard';
import AnalysisList from './components/AnalysisList';
import InsightList from './components/InsightList';
import ChartGrid from './components/ChartGrid';
import SchemaTable from './components/SchemaTable';
import AiQueryPanel from './components/AiQueryPanel';
import SimulationPanel from './components/SimulationPanel';
import PrivacyVaultPanel from './components/PrivacyVaultPanel';
import DiagnosticAgentPanel from './components/DiagnosticAgentPanel';
import ExecutiveBriefingPanel from './components/ExecutiveBriefingPanel';

/* ─── SVG Icons (inline, no external dep) ───────────────── */
const IconBriefcase = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </svg>
);
const IconBrain = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z"/>
  </svg>
);
const IconShield = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IconGrid = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
  </svg>
);
const IconBarChart = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);
const IconSliders = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
    <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
    <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
  </svg>
);
const IconLightbulb = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21h6M12 3a6 6 0 0 1 6 6c0 2.22-1.2 4.16-3 5.2V17H9v-2.8C7.2 13.16 6 11.22 6 9a6 6 0 0 1 6-6z"/>
  </svg>
);
const IconCpu = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
    <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>
  </svg>
);

const IconFile = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);
const IconPrint = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
);

type TabId = 'overview' | 'analytics' | 'simulation' | 'diagnostic' | 'insights' | 'briefing' | 'privacy' | 'ai';

const NAV_ITEMS: { id: TabId; label: string; Icon: React.FC }[] = [
  { id: 'overview',   label: 'Overview',           Icon: IconGrid },
  { id: 'analytics',  label: 'Analytics',          Icon: IconBarChart },
  { id: 'simulation', label: 'Simulation',         Icon: IconSliders },
  { id: 'diagnostic', label: 'Diagnostic Agent',   Icon: IconBrain },
  { id: 'insights',   label: 'Insights',           Icon: IconLightbulb },
  { id: 'briefing',   label: 'Executive Briefing', Icon: IconBriefcase },
  { id: 'privacy',    label: 'Privacy Vault',      Icon: IconShield },
  { id: 'ai',         label: 'AI Query',           Icon: IconCpu },
];

function App() {
  const [schema, setSchema] = useState<TableSchema | null>(null);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [applicableAnalyses, setApplicableAnalyses] = useState<AnalysisTask[]>([]);
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [fileName, setFileName] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter | null>(null);

  useEffect(() => {
    async function loadAnalytics() {
      if (!schema || applicableAnalyses.length === 0) {
        setCharts([]); setInsights([]); return;
      }
      setLoadingAnalytics(true);
      const generatedCharts: ChartConfig[] = [];
      const generatedInsights: Insight[] = [];

      for (const task of applicableAnalyses) {
        try {
          const res = await window.electron.runAnalysis(schema.tableName, task.analysisType, activeFilter || undefined);
          if (res.success) {
            if (res.chartConfig)  generatedCharts.push(res.chartConfig);
            if (res.insights)     generatedInsights.push(...res.insights);
          }
        } catch (err) {
          console.error(`Failed to run analysis ${task.analysisType}:`, err);
        }
      }
      setCharts(generatedCharts);
      setInsights(generatedInsights);
      setLoadingAnalytics(false);
    }
    loadAnalytics();
  }, [schema, applicableAnalyses, activeFilter]);

  const handleImportComplete = (result: { schema: TableSchema; quality: QualityReport; applicableAnalyses: AnalysisTask[]; fileName?: string }) => {
    setSchema(result.schema);
    setQuality(result.quality);
    setApplicableAnalyses(result.applicableAnalyses);
    if (result.fileName) setFileName(result.fileName);
    setActiveFilter(null);
    setActiveTab('overview');
  };

  const handleFilterSelect = (filter: ActiveFilter) => {
    if (activeFilter && activeFilter.column === filter.column && String(activeFilter.value) === String(filter.value)) {
      setActiveFilter(null);
    } else {
      setActiveFilter(filter);
    }
  };

  const hasData = !!schema;

  return (
    <div className="dp-layout">
      {/* ── Sidebar ──────────────────────────────────── */}
      <nav className="dp-sidebar">
        {/* Brand */}
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid #1e2337', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#3b82f6" stroke="#3b82f6" strokeWidth="1" strokeLinejoin="round"/>
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
          <ImportPanel onImportComplete={handleImportComplete} />
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
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="dp-fadein" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <SectionHeader
                    title="Dataset Overview"
                    subtitle={`Schema profiling and data quality analysis for ${fileName || schema?.tableName}`}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {quality && <QualityCard quality={quality} />}
                    <AnalysisList analyses={applicableAnalyses} />
                  </div>
                  {schema && <SchemaTable schema={schema} />}
                </div>
              )}

              {/* Analytics Tab */}
              {activeTab === 'analytics' && (
                <div className="dp-fadein">
                  <SectionHeader title="Statistical Analytics" subtitle="Auto-generated charts from DuckDB analysis queries — click any chart slice to cross-filter" />
                  {activeFilter && (
                    <ActiveFilterBanner filter={activeFilter} onClear={() => setActiveFilter(null)} />
                  )}
                  {loadingAnalytics ? (
                    <LoadingState message="Running filtered analytics queries in DuckDB…" />
                  ) : charts.length > 0 ? (
                    <ChartGrid charts={charts} onFilterSelect={handleFilterSelect} activeFilter={activeFilter} />
                  ) : (
                    <EmptyTabState icon="📊" message="No charts available for this dataset" />
                  )}
                </div>
              )}

              {/* Simulation Tab */}
              {activeTab === 'simulation' && schema && (
                <div className="dp-fadein">
                  <SectionHeader
                    title="What-If Scenario Simulator & Sensitivity"
                    subtitle="Interactive operational levers with live DuckDB recalculation and elasticity rankings"
                  />
                  {activeFilter && (
                    <ActiveFilterBanner filter={activeFilter} onClear={() => setActiveFilter(null)} />
                  )}
                  <SimulationPanel schema={schema} activeFilter={activeFilter} />
                </div>
              )}

              {/* Diagnostic Agent Tab */}
              {activeTab === 'diagnostic' && schema && (
                <div className="dp-fadein">
                  <SectionHeader
                    title="Autonomous Diagnostic AI Agent"
                    subtitle="Multi-step root-cause engine isolating variance drivers and mathematical elasticity across cohorts"
                  />
                  <DiagnosticAgentPanel schema={schema} />
                </div>
              )}

              {/* Insights Tab */}
              {activeTab === 'insights' && (
                <div className="dp-fadein">
                  <SectionHeader title="Evidence-Backed Insights" subtitle="Deterministic insights derived from SQL analytics — each fully verifiable" />
                  {activeFilter && (
                    <ActiveFilterBanner filter={activeFilter} onClear={() => setActiveFilter(null)} />
                  )}
                  {loadingAnalytics ? (
                    <LoadingState message="Synthesizing insights from query results…" />
                  ) : insights.length > 0 ? (
                    <InsightList insights={insights} />
                  ) : (
                    <EmptyTabState icon="💡" message="No insights generated yet" />
                  )}
                </div>
              )}

              {/* Executive Briefing Tab */}
              {activeTab === 'briefing' && schema && (
                <div className="dp-fadein">
                  <SectionHeader
                    title="Executive Intelligence Briefing"
                    subtitle="C-suite synthesis, macro KPI scorecards, and 1-click standalone presentation exports"
                  />
                  <ExecutiveBriefingPanel
                    schema={schema}
                    quality={quality}
                    insights={insights}
                    fileName={fileName}
                  />
                </div>
              )}

              {/* Privacy Vault Tab */}
              {activeTab === 'privacy' && schema && (
                <div className="dp-fadein">
                  <SectionHeader
                    title="Air-Gapped Privacy Vault & PII Anonymizer"
                    subtitle="Automated sensitive entity detection, 1-click DuckDB RAM anonymization, and memory purging"
                  />
                  <PrivacyVaultPanel
                    schema={schema}
                    onPurgeDataset={() => {
                      setSchema(null);
                      setQuality(null);
                      setApplicableAnalyses([]);
                      setCharts([]);
                      setInsights([]);
                      setFileName(null);
                      setActiveFilter(null);
                      setActiveTab('overview');
                    }}
                  />
                </div>
              )}

              {/* AI Query Tab */}
              {activeTab === 'ai' && schema && (
                <div className="dp-fadein">
                  <SectionHeader title="AI Natural Language Query" subtitle="Ask questions in plain English — your local model generates DuckDB SQL" />
                  <AiQueryPanel schema={schema} />
                </div>
              )}
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

/* ─── Helper components ──────────────────────────────── */

function AiStatusDot() {
  const [online, setOnline] = useState(false);
  const [model, setModel] = useState('');

  useEffect(() => {
    const check = async () => {
      if (!window.electron?.checkAiStatus) return;
      try {
        const s = await window.electron.checkAiStatus();
        setOnline(s.available);
        setModel(s.modelName || '');
      } catch {}
    };
    check();
    const id = setInterval(check, 20000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: online ? '#16a34a' : '#b45309', fontWeight: 500 }}>
      <span className={`dp-dot ${online ? 'online' : 'offline'}`} />
      {online ? (model || 'LM Studio') : 'AI Offline'}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em' }}>{title}</h1>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>{subtitle}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: 'calc(100vh - 52px)', gap: 12, textAlign: 'center',
      padding: 40,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 4,
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>Load a dataset to begin</h2>
      <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', maxWidth: 380, lineHeight: 1.6 }}>
        Use the <strong>Load File</strong> button in the sidebar or drag and drop files.
        DataPulse will instantly profile, analyze, and visualize your data — entirely offline.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['.csv','.xlsx','.xls','.json','.parquet'].map(ext => (
          <span key={ext} style={{
            padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: '#141c2e', border: '1px solid #1e293b', color: '#60a5fa',
            fontFamily: 'monospace',
          }}>{ext}</span>
        ))}
      </div>
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '32px 0', color: '#64748b', fontSize: 13 }}>
      <span className="dp-spinner" />
      {message}
    </div>
  );
}

function EmptyTabState({ icon, message }: { icon: string; message: string }) {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
      {message}
    </div>
  );
}

function ActiveFilterBanner({
  filter,
  onClear,
}: {
  filter: ActiveFilter;
  onClear: () => void;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
      background: 'linear-gradient(90deg, #161c2d 0%, #0f1422 100%)',
      border: '1px solid #3b82f6',
      borderRadius: 10,
      padding: '12px 18px',
      marginBottom: 16,
      boxShadow: '0 4px 18px rgba(59,130,246,0.18)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🎯</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Active Drill-Down Filter:</span>
            <span style={{
              background: '#3b82f6',
              color: '#ffffff',
              padding: '2px 10px',
              borderRadius: 6,
              fontFamily: 'monospace',
              fontSize: 13,
              fontWeight: 800,
            }}>
              {filter.column} = "{String(filter.value)}"
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
            All charts, distributions, and insights below are synchronized to this subset in real-time.
          </div>
        </div>
      </div>

      <button
        onClick={onClear}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          color: '#fca5a5',
          borderRadius: 6,
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <span>✕</span>
        <span>Clear Filter</span>
      </button>
    </div>
  );
}

export default App;



