import { AnalysisTask, AnalysisType } from '@core/rules/ruleTypes';

const ANALYSIS_META: Record<AnalysisType, { title: string; description: string; color: string }> = {
  descriptive_stats: {
    title: 'Descriptive Statistics',
    description: 'Mean, median, min/max, std-dev, quartiles',
    color: '#3b82f6',
  },
  group_aggregation: {
    title: 'Group Aggregation',
    description: 'Aggregate numeric values by categorical groups',
    color: '#10b981',
  },
  correlation: {
    title: 'Correlation Analysis',
    description: 'Pearson r between numeric columns',
    color: '#8b5cf6',
  },
  time_series: {
    title: 'Time Series Trends',
    description: 'Metric trajectories over date columns',
    color: '#f59e0b',
  },
};

export default function AnalysisList({ analyses }: { analyses: AnalysisTask[] }) {
  return (
    <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>Applicable Analyses</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
          {analyses.length > 0 ? `${analyses.length} auto-detected from schema` : 'No analyses applicable'}
        </div>
      </div>

      {analyses.length === 0 ? (
        <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>
          Import a dataset with numeric, categorical, or date columns to unlock analyses.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {analyses.map((task) => {
            const meta = ANALYSIS_META[task.analysisType];
            return (
              <div key={task.ruleId} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 7,
                border: '1px solid #1e293b', background: '#141c2e',
                borderLeft: `3px solid ${meta.color}`,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{meta.title}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{meta.description}</div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: meta.color,
                  background: `${meta.color}18`, border: `1px solid ${meta.color}44`,
                  padding: '2px 7px', borderRadius: 99, whiteSpace: 'nowrap',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Active
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}



