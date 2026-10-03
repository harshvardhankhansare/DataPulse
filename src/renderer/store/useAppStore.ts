import { create } from 'zustand';
import { TableSchema } from '@core/schema/schemaTypes';
import { QualityReport } from '@core/profiler/profilerTypes';
import { AnalysisTask } from '@core/rules/ruleTypes';
import { ChartConfig } from '@core/charts/chartTypes';
import { Insight } from '@core/insights/insightTypes';
import { ActiveFilter } from '@core/analytics/filterTypes';

export type TabId =
    | 'overview'
    | 'analytics'
    | 'simulation'
    | 'diagnostic'
    | 'insights'
    | 'briefing'
    | 'privacy'
    | 'ai';

export type OverviewMode = 'editor' | 'blueprint';

export interface ImportResult {
    schema: TableSchema;
    quality: QualityReport;
    applicableAnalyses: AnalysisTask[];
    fileName?: string;
}

interface AppState {
    /* ── Dataset state ─────────────────────────────────── */
    schema: TableSchema | null;
    quality: QualityReport | null;
    applicableAnalyses: AnalysisTask[];
    charts: ChartConfig[];
    insights: Insight[];
    fileName: string | null;

    /* ── UI state ──────────────────────────────────────── */
    activeTab: TabId;
    overviewMode: OverviewMode;
    activeFilter: ActiveFilter | null;
    loadingAnalytics: boolean;
    /** Incremented whenever the underlying table data changes (edits, cleaning) so analytics re-run. */
    dataVersion: number;

    /* ── Actions ────────────────────────────────────────── */
    setActiveTab: (tab: TabId) => void;
    setOverviewMode: (mode: OverviewMode) => void;
    setActiveFilter: (filter: ActiveFilter | null) => void;
    clearFilter: () => void;
    toggleFilter: (filter: ActiveFilter) => void;
    applyImportResult: (result: ImportResult) => void;
    resetData: () => void;
    bumpDataVersion: () => void;
    runAnalytics: () => Promise<void>;
}

/** Module-level counter used to discard stale analytics runs (e.g. filter changed mid-run). */
let analyticsRunId = 0;

export const useAppStore = create<AppState>((set, get) => ({
    schema: null,
    quality: null,
    applicableAnalyses: [],
    charts: [],
    insights: [],
    fileName: null,

    activeTab: 'overview',
    overviewMode: 'editor',
    activeFilter: null,
    loadingAnalytics: false,
    dataVersion: 0,

    setActiveTab: (tab) => set({ activeTab: tab }),
    setOverviewMode: (mode) => set({ overviewMode: mode }),
    setActiveFilter: (filter) => set({ activeFilter: filter }),
    clearFilter: () => set({ activeFilter: null }),

    toggleFilter: (filter) => {
        const current = get().activeFilter;
        if (current && current.column === filter.column && String(current.value) === String(filter.value)) {
            set({ activeFilter: null });
        } else {
            set({ activeFilter: filter });
        }
    },

    applyImportResult: (result) =>
        set({
            schema: result.schema,
            quality: result.quality,
            applicableAnalyses: result.applicableAnalyses,
            fileName: result.fileName ?? get().fileName,
            activeFilter: null,
            activeTab: 'overview',
        }),

    resetData: () =>
        set({
            schema: null,
            quality: null,
            applicableAnalyses: [],
            charts: [],
            insights: [],
            fileName: null,
            activeFilter: null,
            activeTab: 'overview',
        }),

    bumpDataVersion: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),

    runAnalytics: async () => {
        const runId = ++analyticsRunId;
        const { schema, applicableAnalyses, activeFilter } = get();

        if (!schema || applicableAnalyses.length === 0) {
            set({ charts: [], insights: [], loadingAnalytics: false });
            return;
        }

        set({ loadingAnalytics: true });
        const generatedCharts: ChartConfig[] = [];
        const generatedInsights: Insight[] = [];

        for (const task of applicableAnalyses) {
            try {
                const res = await window.electron.runAnalysis(
                    schema.tableName,
                    task.analysisType,
                    activeFilter || undefined
                );
                if (res.success) {
                    if (res.chartConfig) generatedCharts.push(res.chartConfig);
                    if (res.chartConfigs) generatedCharts.push(...res.chartConfigs);
                    if (res.insights) generatedInsights.push(...res.insights);
                }
            } catch (err) {
                console.error(`Failed to run analysis ${task.analysisType}:`, err);
            }
        }

        // Discard stale results if a newer run started while we were awaiting.
        if (runId !== analyticsRunId) return;

        set({ charts: generatedCharts, insights: generatedInsights, loadingAnalytics: false });
    },
}));
