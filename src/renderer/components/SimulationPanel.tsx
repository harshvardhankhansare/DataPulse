import { useState, useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { TableSchema } from '@core/schema/schemaTypes';
import { ActiveFilter } from '@core/analytics/filterTypes';
import { SimulationConfig, SimulationResult } from '@core/simulation/scenarioTypes';

interface SimulationPanelProps {
  schema: TableSchema;
  activeFilter?: ActiveFilter | null;
}

export default function SimulationPanel({ schema, activeFilter }: SimulationPanelProps) {
  const [config, setConfig] = useState<SimulationConfig | null>(null);
  const [targetCol, setTargetCol] = useState<string>('');
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const chartRef = useRef<HTMLDivElement>(null);
  const echartsInstanceRef = useRef<echarts.ECharts | null>(null);

  // 1. Fetch simulation configuration (drivers & candidate targets)
  useEffect(() => {
    async function loadConfig() {
      if (!window.electron?.getSimulationConfig) return;
      try {
        setLoading(true);
        const res = await window.electron.getSimulationConfig(schema.tableName);
        if (res.success && res.config) {
          setConfig(res.config);
          setTargetCol(res.config.targetColumn);
          const initialAdj: Record<string, number> = {};
          res.config.drivers.forEach(d => {
            initialAdj[d.name] = 0;
          });
          setAdjustments(initialAdj);
        }
      } catch (err) {
        console.error('Failed to load simulation config:', err);
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, [schema.tableName]);

  // 2. Run simulation on target or adjustment changes
  useEffect(() => {
    async function executeSimulation() {
      if (!targetCol || !window.electron?.runSimulation) return;
      try {
        const res = await window.electron.runSimulation(
          schema.tableName,
          targetCol,
          adjustments,
          activeFilter || undefined
        );
        if (res.success && res.result) {
          setSimResult(res.result);
        }
      } catch (err) {
        console.error('Simulation execution error:', err);
      }
    }
    executeSimulation();
  }, [schema.tableName, targetCol, adjustments, activeFilter]);

  // 3. Render Comparison & Contribution Chart
  useEffect(() => {
    if (!chartRef.current || !simResult) return;

    if (!echartsInstanceRef.current) {
      echartsInstanceRef.current = echarts.init(chartRef.current);
    }
    const chart = echartsInstanceRef.current;

    const isGain = simResult.deltaTotal >= 0;

    const option: echarts.EChartsOption = {
      backgroundColor: '#111726',
      title: {
        text: 'Baseline vs. Projected Outcome',
        left: 16,
        top: 14,
        textStyle: { color: '#f8fafc', fontSize: 13, fontWeight: 700 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#141c2e',
        borderColor: '#3b82f6',
        textStyle: { color: '#f8fafc', fontSize: 12 },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          return `<b>${p.name}</b><br/>Value: <b style="color:#60a5fa">${Number(p.value).toLocaleString()}</b>`;
        },
      },
      grid: { left: '16%', right: '10%', top: 55, bottom: 30 },
      xAxis: {
        type: 'category',
        data: ['Current Baseline', 'Simulated Future'],
        axisLabel: { color: '#94a3b8', fontSize: 12, fontWeight: 600 },
        axisLine: { lineStyle: { color: '#1e293b' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#94a3b8',
          fontSize: 11,
          formatter: (v: number) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)),
        },
        splitLine: { lineStyle: { color: '#1a2234' } },
      },
      series: [
        {
          type: 'bar',
          data: [
            {
              value: simResult.baselineTotal,
              itemStyle: { color: '#475569', borderRadius: [6, 6, 0, 0] },
            },
            {
              value: simResult.projectedTotal,
              itemStyle: {
                color: isGain ? '#10b981' : '#ef4444',
                borderRadius: [6, 6, 0, 0],
              },
            },
          ],
          barMaxWidth: 56,
          label: {
            show: true,
            position: 'top',
            color: '#f8fafc',
            fontSize: 12,
            fontWeight: 700,
            formatter: (p: any) => Number(p.value).toLocaleString(),
          },
        },
      ],
    };

    chart.setOption(option, true);
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [simResult]);

  const handleSliderChange = (driverName: string, val: number) => {
    setAdjustments(prev => ({
      ...prev,
      [driverName]: val,
    }));
  };

  const applyPreset = (presetType: 'reset' | 'growth' | 'conservative' | 'stress') => {
    if (!config || !simResult) return;
    const newAdj: Record<string, number> = {};

    config.drivers.forEach(d => {
      const sens = simResult.sensitivity.find(s => s.driverName === d.name);
      const isPositive = (sens?.correlation ?? 0) >= 0;

      if (presetType === 'reset') {
        newAdj[d.name] = 0;
      } else if (presetType === 'growth') {
        newAdj[d.name] = isPositive ? 20 : -10;
      } else if (presetType === 'conservative') {
        newAdj[d.name] = isPositive ? 5 : -5;
      } else if (presetType === 'stress') {
        newAdj[d.name] = isPositive ? -15 : 10;
      }
    });

    setAdjustments(newAdj);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '40px 0', color: '#64748b', fontSize: 13 }}>
        <span className="dp-spinner" />
        Configuring statistical simulation model...
      </div>
    );
  }

  if (!config || config.drivers.length === 0) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        No numeric metrics available for simulation in this dataset.
      </div>
    );
  }

  const isPositiveDelta = (simResult?.deltaTotal ?? 0) >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ─── Top Control Header & Presets ─── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        background: '#111726',
        padding: '14px 18px',
        borderRadius: 10,
        border: '1px solid #1e293b',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🎯</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
              Metric to Predict:
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              Select which business metric changes as you move the sliders
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <select
            value={targetCol}
            onChange={(e) => setTargetCol(e.target.value)}
            style={{
              padding: '7px 14px',
              borderRadius: 6,
              border: '1px solid #3b82f6',
              fontSize: 12,
              fontWeight: 700,
              color: '#60a5fa',
              background: '#141c2e',
              cursor: 'pointer',
              outline: 'none',
              fontFamily: 'monospace',
            }}
          >
            {config.availableTargets.map(col => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>

          {/* Quick Presets */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => applyPreset('reset')}
              style={{
                padding: '6px 11px',
                borderRadius: 6,
                border: '1px solid #1e293b',
                background: '#141c2e',
                color: '#cbd5e1',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Reset all sliders to 0%"
            >
              🔄 Reset (0%)
            </button>
            <button
              onClick={() => applyPreset('growth')}
              style={{
                padding: '6px 11px',
                borderRadius: 6,
                border: '1px solid rgba(16, 185, 129, 0.4)',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Boost positive drivers by +20% and reduce drag"
            >
              🚀 Growth (+20%)
            </button>
            <button
              onClick={() => applyPreset('conservative')}
              style={{
                padding: '6px 11px',
                borderRadius: 6,
                border: '1px solid rgba(59, 130, 246, 0.4)',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#93c5fd',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Modest +5% shift"
            >
              🛡️ Conservative (+5%)
            </button>
            <button
              onClick={() => applyPreset('stress')}
              style={{
                padding: '6px 11px',
                borderRadius: 6,
                border: '1px solid rgba(239, 68, 68, 0.4)',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Simulate a market downturn (-15%)"
            >
              📉 Stress Test (-15%)
            </button>
          </div>
        </div>
      </div>

      {/* ─── Hero Scorecards (Top) ─── */}
      {simResult && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}>
          {/* Baseline Card */}
          <div style={{
            background: '#111726',
            border: '1px solid #1e293b',
            borderRadius: 10,
            padding: '16px 20px',
          }}>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current Historical Total
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc', fontFamily: 'monospace', marginTop: 4 }}>
              {Number(simResult.baselineTotal).toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
              Historical average per row: <b>{Number(simResult.baselineAvg).toLocaleString()}</b>
            </div>
          </div>

          {/* Projected Outcome Card */}
          <div style={{
            background: '#111726',
            border: '1px solid #3b82f6',
            borderRadius: 10,
            padding: '16px 20px',
            boxShadow: '0 4px 18px rgba(59,130,246,0.18)',
          }}>
            <div style={{ color: '#60a5fa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Simulated Future Total
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace', marginTop: 4 }}>
              {Number(simResult.projectedTotal).toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
              Projected average per row: <b>{Number(simResult.projectedAvg).toLocaleString()}</b>
            </div>
          </div>

          {/* Simulated Delta Card */}
          <div style={{
            background: '#111726',
            border: `1px solid ${isPositiveDelta ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
            borderRadius: 10,
            padding: '16px 20px',
          }}>
            <div style={{
              color: isPositiveDelta ? '#34d399' : '#f87171',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Expected Difference (Net Impact)
            </div>
            <div style={{
              fontSize: 28,
              fontWeight: 800,
              color: isPositiveDelta ? '#10b981' : '#ef4444',
              fontFamily: 'monospace',
              marginTop: 4,
            }}>
              {isPositiveDelta ? '+' : ''}{Number(simResult.deltaTotal).toLocaleString()}
            </div>
            <div style={{
              display: 'inline-block',
              marginTop: 4,
              fontSize: 12,
              fontWeight: 800,
              color: isPositiveDelta ? '#34d399' : '#f87171',
              background: isPositiveDelta ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              padding: '2px 8px',
              borderRadius: 4,
            }}>
              {isPositiveDelta ? '▲ +' : '▼ '}{simResult.percentChange}%
            </div>
          </div>
        </div>
      )}

      {/* ─── Main 2-Column Split: Sliders on Left, Analysis on Right ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
        gap: 16,
      }}>
        {/* ── Left Column: Operational Sliders ── */}
        <div style={{
          background: '#111726',
          borderRadius: 10,
          padding: '18px',
          border: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                Operational Control Levers
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                Drag sliders to simulate business decisions (-50% to +100%)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {config.drivers.map((driver) => {
              const val = adjustments[driver.name] ?? 0;
              const isPositive = val > 0;
              const isNegative = val < 0;

              // Find contribution
              const contribution = simResult?.driverContributions?.find(c => c.driverName === driver.name);
              const indDelta = contribution?.individualDelta ?? 0;

              // Relationship pill
              const corr = driver.correlation;
              const isPositiveCorr = corr > 0.08;
              const isNegativeCorr = corr < -0.08;

              return (
                <div
                  key={driver.name}
                  style={{
                    background: '#141c2e',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                        {driver.label}
                      </span>

                      {/* Relationship Pill */}
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: 99,
                        background: isPositiveCorr ? 'rgba(16, 185, 129, 0.15)' : isNegativeCorr ? 'rgba(239, 68, 68, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                        color: isPositiveCorr ? '#34d399' : isNegativeCorr ? '#f87171' : '#94a3b8',
                      }}>
                        {isPositiveCorr ? `🟢 Drives Growth (+${corr})` : isNegativeCorr ? `🔴 Negative Drag (${corr})` : `⚪ Neutral (${corr})`}
                      </span>
                    </div>

                    <span style={{
                      fontSize: 13,
                      fontWeight: 800,
                      fontFamily: 'monospace',
                      color: isPositive ? '#60a5fa' : isNegative ? '#f87171' : '#94a3b8',
                    }}>
                      {val > 0 ? `+${val}%` : `${val}%`}
                    </span>
                  </div>

                  {/* Range Slider */}
                  <input
                    type="range"
                    min="-50"
                    max="100"
                    step="1"
                    value={val}
                    onChange={(e) => handleSliderChange(driver.name, Number(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: '#3b82f6',
                      cursor: 'pointer',
                    }}
                  />

                  {/* Quick Preset Buttons & Individual Delta */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[-25, -10, 0, 10, 25, 50].map(preset => (
                        <button
                          key={preset}
                          onClick={() => handleSliderChange(driver.name, preset)}
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: 4,
                            border: '1px solid #1e293b',
                            background: val === preset ? '#3b82f6' : '#0e1422',
                            color: val === preset ? '#ffffff' : '#94a3b8',
                            cursor: 'pointer',
                          }}
                        >
                          {preset > 0 ? `+${preset}%` : preset === 0 ? '0%' : `${preset}%`}
                        </button>
                      ))}
                    </div>

                    {/* Instant Impact Line */}
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: indDelta > 0 ? '#34d399' : indDelta < 0 ? '#f87171' : '#64748b',
                    }}>
                      {val === 0 ? 'Baseline (No shift)' : `${indDelta >= 0 ? '+' : ''}${indDelta.toLocaleString()} on ${targetCol}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right Column: The Analysis Card (What Is Actually Happening?) ── */}
        <div style={{
          background: '#111726',
          borderRadius: 10,
          padding: '18px',
          border: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          <div style={{ borderBottom: '1px solid #1e293b', paddingBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
              Live Impact &amp; Intelligence Analysis
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
              Visual breakdown and plain-English explanation of your simulation
            </div>
          </div>

          {/* Visual Chart */}
          <div ref={chartRef} style={{ width: '100%', height: 210, borderRadius: 8, overflow: 'hidden' }} />

          {/* Plain English Explanation Box */}
          <div style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 8,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>💡 What This Means in Plain English:</span>
            </div>
            <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.5 }}>
              {simResult?.summaryText}
            </div>
          </div>

          {/* Active Drivers Breakdown */}
          {simResult && simResult.driverContributions && simResult.driverContributions.some(c => c.adjustmentPercent !== 0) && (
            <div style={{
              background: '#141c2e',
              border: '1px solid #1e293b',
              borderRadius: 8,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Driver Impact Contribution
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {simResult.driverContributions
                  .filter(c => c.adjustmentPercent !== 0)
                  .map(c => (
                    <div key={c.driverName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#f8fafc', fontWeight: 600 }}>{c.label}</span>
                        <span style={{ color: '#60a5fa', fontFamily: 'monospace', fontSize: 11 }}>
                          ({c.adjustmentPercent > 0 ? `+${c.adjustmentPercent}%` : `${c.adjustmentPercent}%`})
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          color: c.individualDelta >= 0 ? '#10b981' : '#ef4444',
                        }}>
                          {c.individualDelta >= 0 ? '+' : ''}{c.individualDelta.toLocaleString()}
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          ({c.shareOfChangePercent}% share)
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Strategic Recommendation */}
          {simResult?.recommendationText && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 8,
              padding: '11px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>🎯</span>
              <div style={{ fontSize: 11, color: '#a7f3d0', fontWeight: 600, lineHeight: 1.4 }}>
                {simResult.recommendationText}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
