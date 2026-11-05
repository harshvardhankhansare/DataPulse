import { useState, useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import {
  DiagnosticReport,
  DiagnosticTargetOption,
} from '@core/diagnostic/diagnosticTypes';
import { useAppStore } from '../store/useAppStore';

export default function DiagnosticAgentPanel() {
  const schema = useAppStore(s => s.schema);
  const [targets, setTargets] = useState<DiagnosticTargetOption[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string>('');
  const [selectedDimension, setSelectedDimension] = useState<string>('');
  const [userQuestion, setUserQuestion] = useState<string>('');
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeStepTab, setActiveStepTab] = useState<number>(0);
  const [copiedSql, setCopiedSql] = useState<number | null>(null);

  const chartRef = useRef<HTMLDivElement>(null);
  const echartsRef = useRef<echarts.ECharts | null>(null);

  const runInvestigation = async (
    metric?: string,
    dimension?: string,
    question?: string
  ) => {
    const targetM = metric || selectedMetric;
    const targetD = dimension || selectedDimension;
    if (!schema || !targetM) return;

    setLoading(true);
    try {
      const res = await window.electron.runDiagnosticInvestigation(
        schema.tableName,
        targetM,
        targetD,
        question || userQuestion
      );
      if (res.success && res.report) {
        setReport(res.report);
      }
    } catch (err) {
      console.error('Diagnostic investigation failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // 1. Fetch available target metrics and dimensions
  useEffect(() => {
    async function loadTargets() {
      if (!schema || !window.electron?.getDiagnosticTargets) return;
      try {
        const res = await window.electron.getDiagnosticTargets(schema.tableName);
        if (res.success && res.targets && res.targets.length > 0) {
          setTargets(res.targets);
          const firstMetric = res.targets[0];
          setSelectedMetric(firstMetric.metric);
          if (firstMetric.dimensions.length > 0) {
            setSelectedDimension(firstMetric.dimensions[0]);
          }
          // Automatically trigger first investigation for immediate insights!
          runInvestigation(firstMetric.metric, firstMetric.dimensions[0]);
        }
      } catch (err) {
        console.error('Failed to load diagnostic targets:', err);
      }
    }
    loadTargets();
  }, [schema?.tableName]);

  // When selected metric changes, update available dimensions
  const handleMetricChange = (metric: string) => {
    setSelectedMetric(metric);
    const targetObj = targets.find(t => t.metric === metric);
    if (targetObj && targetObj.dimensions.length > 0) {
      setSelectedDimension(targetObj.dimensions[0]);
    }
  };

  // 2. Render ECharts Waterfall Bridge Chart
  useEffect(() => {
    if (!chartRef.current || !report) return;

    if (!echartsRef.current) {
      echartsRef.current = echarts.init(chartRef.current);
    }
    const chart = echartsRef.current;

    // Calculate Waterfall stacked series
    // Labels: [Baseline, ...Drivers, Comparison]
    const labels: string[] = [report.waterfallChart.data?.[0]?.label || 'Baseline'];
    const placeholders: number[] = [0];
    const deltas: number[] = [report.totalBaseline];
    const colors: string[] = ['#3b82f6']; // Baseline bar color

    let runningTotal = report.totalBaseline;

    for (const d of report.drivers.slice(0, 6)) {
      labels.push(d.name);
      if (d.absoluteDelta >= 0) {
        placeholders.push(runningTotal);
        deltas.push(d.absoluteDelta);
        colors.push('#10b981'); // Boost = emerald green
        runningTotal += d.absoluteDelta;
      } else {
        runningTotal += d.absoluteDelta;
        placeholders.push(runningTotal);
        deltas.push(Math.abs(d.absoluteDelta));
        colors.push('#ef4444'); // Drag = coral red
      }
    }

    // Final Comparison Total Bar
    labels.push(report.waterfallChart.data?.[report.waterfallChart.data.length - 1]?.label || 'Recent Period');
    placeholders.push(0);
    deltas.push(report.totalComparison);
    colors.push('#06b6d4'); // Final bar color

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 12 },
        formatter: (params: any) => {
          const idx = params[0]?.dataIndex;
          const label = labels[idx];
          const val = deltas[idx];
          if (idx === 0) {
            return `<b>${label}</b><br/>Total: <b>${val.toLocaleString()}</b>`;
          }
          if (idx === labels.length - 1) {
            return `<b>${label}</b><br/>Total: <b>${val.toLocaleString()}</b>`;
          }
          const driver = report.drivers[idx - 1];
          const sign = driver?.absoluteDelta >= 0 ? '+' : '';
          return `<b>${label}</b><br/>Variance: <b>${sign}${driver?.absoluteDelta.toLocaleString()}</b><br/>Impact: <b>${driver?.contributionPct}% of total drift</b>`;
        },
      },
      grid: {
        top: 40,
        left: 60,
        right: 20,
        bottom: 40,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8', fontSize: 11, interval: 0, rotate: labels.length > 5 ? 20 : 0 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
        axisLabel: { color: '#94a3b8', fontSize: 11 },
      },
      series: [
        {
          name: 'Placeholder',
          type: 'bar',
          stack: 'Total',
          itemStyle: {
            borderColor: 'transparent',
            color: 'transparent',
          },
          data: placeholders,
        },
        {
          name: 'Variance',
          type: 'bar',
          stack: 'Total',
          label: {
            show: true,
            position: 'top',
            color: '#cbd5e1',
            fontSize: 10,
            formatter: (params: any) => {
              const idx = params.dataIndex;
              if (idx === 0 || idx === labels.length - 1) {
                return deltas[idx].toLocaleString();
              }
              const d = report.drivers[idx - 1];
              return `${d?.absoluteDelta >= 0 ? '+' : ''}${d?.absoluteDelta.toLocaleString()}`;
            },
          },
          data: deltas.map((val, idx) => ({
            value: val,
            itemStyle: {
              color: colors[idx],
              borderRadius: [4, 4, 0, 0],
            },
          })),
        },
      ],
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [report]);

  const copySql = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedSql(idx);
    setTimeout(() => setCopiedSql(null), 2000);
  };

  const currentTargetObj = targets.find(t => t.metric === selectedMetric);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Target & Investigation Goal Selector */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#f8fafc' }}>
              Autonomous Diagnostic Investigation
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
              Multi-step root-cause engine isolating variance drivers and mathematical elasticity across cohorts.
            </p>
          </div>

          {/* Metric & Dimension Dropdowns */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 6 }}>TARGET METRIC:</span>
              <select
                value={selectedMetric}
                onChange={e => handleMetricChange(e.target.value)}
                style={selectStyle}
              >
                {targets.map(t => (
                  <option key={t.metric} value={t.metric}>
                    {t.metric}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 6 }}>DIMENSION:</span>
              <select
                value={selectedDimension}
                onChange={e => setSelectedDimension(e.target.value)}
                style={selectStyle}
              >
                {currentTargetObj?.dimensions.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => runInvestigation()}
              disabled={loading}
              style={{
                padding: '8px 18px',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
                boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
              }}
            >
              {loading ? 'Analyzing…' : '⚡ Investigate'}
            </button>
          </div>
        </div>

        {/* Suggested Investigation Prompt Chips */}
        {currentTargetObj && currentTargetObj.suggestedQuestions.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>SUGGESTED QUESTIONS:</span>
            {currentTargetObj.suggestedQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setUserQuestion(q);
                  runInvestigation(selectedMetric, selectedDimension, q);
                }}
                style={{
                  background: 'rgba(59, 130, 246, 0.1)',
                  color: '#93c5fd',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 14,
                  padding: '4px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                💡 {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ padding: '60px 0', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>🧠</div>
          <div>Planning and executing multi-step diagnostic investigation in DuckDB…</div>
        </div>
      )}

      {report && !loading && (
        <>
          {/* Executive Root-Cause Scorecard */}
          <div
            style={{
              background:
                report.netDelta < 0
                  ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(15, 23, 42, 0.95) 100%)'
                  : 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: `1px solid ${report.netDelta < 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
              borderRadius: 12,
              padding: '22px 24px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <span
                  style={{
                    background: report.netDelta < 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    color: report.netDelta < 0 ? '#f87171' : '#34d399',
                    border: `1px solid ${report.netDelta < 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                    padding: '3px 10px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                  }}
                >
                  AUTONOMOUS ROOT-CAUSE SYNTHESIS
                </span>
                <h2 style={{ margin: '10px 0 6px', fontSize: 20, fontWeight: 800, color: '#f8fafc' }}>
                  {report.executiveSummary.headline}
                </h2>
                <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, maxWidth: 840 }}>
                  <p style={{ margin: '0 0 8px' }}>
                    🚨 <b>Primary Root Cause:</b> {report.executiveSummary.primaryRootCause}
                  </p>
                  <p style={{ margin: 0, color: '#94a3b8' }}>
                    🛡️ <b>Mitigating Factors:</b> {report.executiveSummary.mitigatingFactors}
                  </p>
                </div>
              </div>

              {/* Primary Driver Impact Pill */}
              <div
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: '12px 18px',
                  textAlign: 'right',
                }}
              >
                <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Primary Variance Share
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    color: report.primaryDriver.impact === 'drag' ? '#f87171' : '#34d399',
                    fontFamily: 'monospace',
                  }}
                >
                  {report.primaryDriver.contributionPct}%
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 2 }}>
                  {report.primaryDriver.name} ({report.primaryDriver.absoluteDelta >= 0 ? '+' : ''}
                  {report.primaryDriver.absoluteDelta.toLocaleString()})
                </div>
              </div>
            </div>

            {/* Actionable Recommendations */}
            <div style={{ marginTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>
                ⚡ STRATEGIC ACTION RECOMMENDATIONS:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                {report.executiveSummary.actionableRecommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      fontSize: 12,
                      color: '#e2e8f0',
                      lineHeight: 1.4,
                    }}
                  >
                    <span style={{ color: '#38bdf8', fontWeight: 700, marginRight: 6 }}>#{idx + 1}</span>
                    {rec}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Waterfall Variance Bridge Chart & Driver Ranking */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
            {/* Waterfall Bridge */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                    {report.waterfallChart.title}
                  </h4>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    Visual variance breakdown: Baseline ➔ Segment Drifts ➔ Final Total
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                  <span style={{ color: '#10b981' }}>● Positive Boost</span>
                  <span style={{ color: '#ef4444' }}>● Negative Drag</span>
                </div>
              </div>
              <div ref={chartRef} style={{ width: '100%', height: 320 }} />
            </div>

            {/* Driver Contribution Table */}
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                  Segment Variance Contribution
                </h4>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  Ranked by absolute mathematical leverage
                </div>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.02)', color: '#94a3b8', textAlign: 'left' }}>
                      <th style={thStyle}>Segment</th>
                      <th style={thStyle}>Delta</th>
                      <th style={thStyle}>Variance %</th>
                      <th style={thStyle}>Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.drivers.map((d, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ ...tdStyle, fontWeight: 600, color: '#f1f5f9' }}>{d.name}</td>
                        <td
                          style={{
                            ...tdStyle,
                            fontFamily: 'monospace',
                            color: d.absoluteDelta >= 0 ? '#34d399' : '#f87171',
                            fontWeight: 700,
                          }}
                        >
                          {d.absoluteDelta >= 0 ? '+' : ''}
                          {d.absoluteDelta.toLocaleString()}
                        </td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#cbd5e1' }}>
                          {d.contributionPct}%
                        </td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              background:
                                d.impact === 'drag'
                                  ? 'rgba(239, 68, 68, 0.15)'
                                  : d.impact === 'boost'
                                    ? 'rgba(16, 185, 129, 0.15)'
                                    : 'rgba(148, 163, 184, 0.15)',
                              color:
                                d.impact === 'drag'
                                  ? '#f87171'
                                  : d.impact === 'boost'
                                    ? '#34d399'
                                    : '#94a3b8',
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              textTransform: 'uppercase',
                            }}
                          >
                            {d.impact}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Investigation Step-by-Step Audit Trail */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                  Investigation Audit Trail (3 Steps Executed in RAM)
                </h4>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Full SQL transparency: inspect queries executed by the diagnostic engine
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {report.steps.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveStepTab(idx)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: activeStepTab === idx ? '#2563eb' : '#1e293b',
                      color: activeStepTab === idx ? '#fff' : '#94a3b8',
                      border: '1px solid #334155',
                    }}
                  >
                    Step {s.stepNumber} ({s.executionMs}ms)
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Step Detail */}
            {report.steps[activeStepTab] && (
              <div
                style={{
                  background: '#090d16',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: 14 }}>
                      {report.steps[activeStepTab].title}
                    </span>
                    <span
                      style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#34d399',
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      ⚡ {report.steps[activeStepTab].executionMs}ms in DuckDB
                    </span>
                  </div>
                  <button
                    onClick={() => copySql(report.steps[activeStepTab].sql, activeStepTab)}
                    style={{
                      background: '#1e293b',
                      color: '#cbd5e1',
                      border: '1px solid #334155',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {copiedSql === activeStepTab ? '✓ Copied!' : '📋 Copy SQL'}
                  </button>
                </div>

                <p style={{ margin: '0 0 12px', fontSize: 13, color: '#38bdf8', lineHeight: 1.4 }}>
                  🔎 <b>Key Finding:</b> {report.steps[activeStepTab].discovery}
                </p>

                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    background: '#030712',
                    borderRadius: 6,
                    color: '#a5f3fc',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    overflowX: 'auto',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  {report.steps[activeStepTab].sql}
                </pre>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#111827',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 12,
  padding: 18,
};

const selectStyle: React.CSSProperties = {
  background: '#1e293b',
  color: '#f8fafc',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
};

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
};
