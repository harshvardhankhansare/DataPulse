import { useAppStore } from '../store/useAppStore';
import DataEditor from './DataEditor';
import ChartGrid from './ChartGrid';
import SimulationPanel from './SimulationPanel';
import DiagnosticAgentPanel from './DiagnosticAgentPanel';
import InsightList from './InsightList';
import ExecutiveBriefingPanel from './ExecutiveBriefingPanel';
import PrivacyVaultPanel from './PrivacyVaultPanel';
import AiQueryPanel from './AiQueryPanel';
import QualityCard from './QualityCard';
import AnalysisList from './AnalysisList';
import SchemaTable from './SchemaTable';
import { SectionHeader, LoadingState, EmptyTabState, ActiveFilterBanner } from './common';

/* ─── Data & Editor Tab ─────────────────────────────────── */

export function OverviewTab() {
    const schema = useAppStore(s => s.schema);
    const quality = useAppStore(s => s.quality);
    const applicableAnalyses = useAppStore(s => s.applicableAnalyses);
    const fileName = useAppStore(s => s.fileName);
    const overviewMode = useAppStore(s => s.overviewMode);
    const setOverviewMode = useAppStore(s => s.setOverviewMode);

    return (
        <div className="dp-fadein" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <SectionHeader
                    title="Data Table & Quick Clean"
                    subtitle={`View, double-click to edit values, delete errors, and export clean data (${fileName || schema?.tableName})`}
                />

                {/* View Switcher: Data Editor vs Blueprint */}
                <div style={{
                    display: 'flex',
                    background: '#141c2e',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    padding: 3,
                    gap: 4
                }}>
                    <button
                        onClick={() => setOverviewMode('editor')}
                        style={{
                            background: overviewMode === 'editor' ? '#3b82f6' : 'transparent',
                            color: overviewMode === 'editor' ? '#ffffff' : '#94a3b8',
                            border: 'none',
                            borderRadius: 6,
                            padding: '6px 14px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        📊 Data Rows & Editor
                    </button>
                    <button
                        onClick={() => setOverviewMode('blueprint')}
                        style={{
                            background: overviewMode === 'blueprint' ? '#3b82f6' : 'transparent',
                            color: overviewMode === 'blueprint' ? '#ffffff' : '#94a3b8',
                            border: 'none',
                            borderRadius: 6,
                            padding: '6px 14px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        📋 Column Health & Blueprint
                    </button>
                </div>
            </div>

            {overviewMode === 'editor' && schema && (
                <DataEditor />
            )}

            {overviewMode === 'blueprint' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        {quality && <QualityCard quality={quality} />}
                        <AnalysisList analyses={applicableAnalyses} />
                    </div>
                    {schema && <SchemaTable schema={schema} />}
                </div>
            )}
        </div>
    );
}

/* ─── Visual Charts Tab ────────────────────────────────── */

export function AnalyticsTab() {
    const activeFilter = useAppStore(s => s.activeFilter);
    const clearFilter = useAppStore(s => s.clearFilter);
    const loadingAnalytics = useAppStore(s => s.loadingAnalytics);
    const charts = useAppStore(s => s.charts);

    return (
        <div className="dp-fadein">
            <SectionHeader
                title="Visual Charts & Patterns"
                subtitle="Automatic charts showing distributions, correlations, and key patterns in your numbers (click any chart slice to filter)"
            />
            {activeFilter && (
                <ActiveFilterBanner filter={activeFilter} onClear={clearFilter} />
            )}
            {loadingAnalytics ? (
                <LoadingState message="Creating your charts..." />
            ) : charts.length > 0 ? (
                <ChartGrid />
            ) : (
                <EmptyTabState icon="📊" message="No charts available for this dataset" />
            )}
        </div>
    );
}

/* ─── What-If Calculator Tab ───────────────────────────── */

export function SimulationTab() {
    const activeFilter = useAppStore(s => s.activeFilter);
    const clearFilter = useAppStore(s => s.clearFilter);

    return (
        <div className="dp-fadein">
            <SectionHeader
                title="What-If Calculator"
                subtitle="Move the sliders to see what happens when you adjust prices, expenses, or volume"
            />
            {activeFilter && (
                <ActiveFilterBanner filter={activeFilter} onClear={clearFilter} />
            )}
            <SimulationPanel />
        </div>
    );
}

/* ─── Problem Finder Tab ───────────────────────────────── */

export function DiagnosticTab() {
    return (
        <div className="dp-fadein">
            <SectionHeader
                title="Problem Finder (Why Did It Happen?)"
                subtitle="Investigate the exact reasons and drivers behind sudden spikes or drops in your numbers"
            />
            <DiagnosticAgentPanel />
        </div>
    );
}

/* ─── Key Findings Tab ─────────────────────────────────── */

export function InsightsTab() {
    const activeFilter = useAppStore(s => s.activeFilter);
    const clearFilter = useAppStore(s => s.clearFilter);
    const loadingAnalytics = useAppStore(s => s.loadingAnalytics);
    const insights = useAppStore(s => s.insights);

    return (
        <div className="dp-fadein">
            <SectionHeader
                title="Key Findings & Takeaways"
                subtitle="Important takeaways written in plain English, backed directly by your data"
            />
            {activeFilter && (
                <ActiveFilterBanner filter={activeFilter} onClear={clearFilter} />
            )}
            {loadingAnalytics ? (
                <LoadingState message="Discovering findings from your data..." />
            ) : insights.length > 0 ? (
                <InsightList insights={insights} />
            ) : (
                <EmptyTabState icon="💡" message="No insights generated yet" />
            )}
        </div>
    );
}

/* ─── Summary Report Tab ───────────────────────────────── */

export function BriefingTab() {
    return (
        <div className="dp-fadein">
            <SectionHeader
                title="Summary Report"
                subtitle="A clean 1-page summary report with scorecards and key metrics, ready to print or save"
            />
            <ExecutiveBriefingPanel />
        </div>
    );
}

/* ─── Hide Sensitive Info Tab ──────────────────────────── */

export function PrivacyTab() {
    return (
        <div className="dp-fadein">
            <SectionHeader
                title="Hide Sensitive Information"
                subtitle="Automatically find and mask private information like names, emails, and phone numbers"
            />
            <PrivacyVaultPanel />
        </div>
    );
}

/* ─── Ask AI in Plain English Tab ──────────────────────── */

export function AiTab() {
    return (
        <div className="dp-fadein">
            <SectionHeader
                title="Ask Questions in Plain English"
                subtitle="Type questions like 'Who are the top 5 customers?' or 'Show sales by month' to get instant answers"
            />
            <AiQueryPanel />
        </div>
    );
}
