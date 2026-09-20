import { useState, useEffect, useRef, useMemo } from 'react';
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

  const tornadoChartRef = useRef<HTMLDivElement>(null);
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
          // initialize 0% adjustment for each driver
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

  // 3. Render ECharts Sensitivity Tornado Chart
  useEffect(() => {
    if (!tornadoChartRef.current || !simResult || simResult.sensitivity.length === 0) return;

    if (!echartsInstanceRef.current) {
      echartsInstanceRef.current = echarts.init(tornadoChartRef.current);
    }
    const chart = echartsInstanceRef.current;

    const sortedDrivers = [...simResult.sensitivity].reverse();

    const option: echarts.EChartsOption = {
      backgroundColor: '#0f1117',
      title: {
        text: 'Driver Elasticity Ranking (+10% Standard Shift Impact)',
        left: 16,
        top: 12,
        textStyle: { color: '#f1f5f9', fontSize: 13, fontWeight: 700 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#1e2440',
        borderColor: '#3b82f6',
        textStyle: { color: '#f8fafc', fontSize: 13 },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          return `<b>${p.name}</b><br/>Marginal (+10%) Shift: <b style="color:#38bdf8;font-size:15px">+${Number(p.value).toLocaleString()}</b>`;
        },
      },
      grid: { left: '22%', right: '12%', top: 50, bottom: 25 },
      xAxis: {
        type: 'value',
        axisLabel: { color: '#cbd5e1', fontSize: 11 },
        splitLine: { lineStyle: { color: '#1e2337' } },
      },
      yAxis: {
        type: 'category',
        data: sortedDrivers.map(d => d.driverName.replace(/_/g, ' ')),
        axisLabel: {
          color: '#f8fafc',
          fontSize: 12,
          fontWeight: 600,
        },
        axisLine: { lineStyle: { color: '#2d3348' } },
      },
      series: [
        {
          type: 'bar',
          data: sortedDrivers.map((d, i) => ({
            value: d.impactPerTenPercent,
            itemStyle: {
              color: i === sortedDrivers.length - 1 ? '#3b82f6' : '#6366f1',
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barMaxWidth: 24,
          label: {
            show: true,
            position: 'right',
            color: '#ffffff',
            fontSize: 12,
            fontWeight: 700,
            formatter: (p: any) => `+${Number(p.value).toLocaleString()}`,
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

  const resetAllSliders = () => {
    if (!config) return;
    const reset: Record<string, number> = {};
    config.drivers.forEach(d => {
      reset[d.name] = 0;
    });
    setAdjustments(reset);
  };

  // Top driver recommendation
  const topDriver = useMemo(() => {
    if (!simResult || simResult.sensitivity.length === 0) return null;
    return simResult.sensitivity[0];
  }, [simResult]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '40px 0', color: '#64748b', fontSize: 13 }}>
        <span className="dp-spinner" />
        Configuring simulation model in DuckDB…
      </div>
    );
  }

  if (!config || config.drivers.length === 0) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        No numeric drivers detected for simulation in this dataset.
      </div>
    );
  }

  const isPositiveDelta = (simResult?.deltaTotal ?? 0) >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Target Outcome Selector */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        background: '#ffffff',
        padding: '14px 20px',
        borderRadius: 10,
        border: '1px solid #e2e8f0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🎯</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
              Projected Target Metric
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Choose which business outcome to forecast across simulated scenarios
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={targetCol}
            onChange={(e) => setTargetCol(e.target.value)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontSize: 13,
              fontWeight: 600,
              color: '#0f172a',
              background: '#ffffff',
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {config.availableTargets.map(col => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>

          <button
            onClick={resetAllSliders}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              color: '#475569',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            ↺ Reset Sliders
          </button>
        </div>
      </div>

      {/* Hero Projection Scorecard */}
      {simResult && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}>
          {/* Baseline Card */}
          <div style={{
            background: '#0f1117',
            border: '1px solid #1e2337',
            borderRadius: 12,
            padding: '18px 20px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Historical Baseline
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', fontFamily: 'monospace', marginTop: 6 }}>
              {Number(simResult.baselineTotal).toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              Average per record: <b>{Number(simResult.baselineAvg).toLocaleString()}</b>
            </div>
          </div>

          {/* Projected Outcome Card */}
          <div style={{
            background: '#0f1117',
            border: '1px solid #3b82f6',
            borderRadius: 12,
            padding: '18px 20px',
            boxShadow: '0 4px 20px rgba(59,130,246,0.25)',
          }}>
            <div style={{ color: '#60a5fa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Projected Outcome
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace', marginTop: 6 }}>
              {Number(simResult.projectedTotal).toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Projected avg: <b>{Number(simResult.projectedAvg).toLocaleString()}</b>
            </div>
          </div>

          {/* Simulated Delta Card */}
          <div style={{
            background: '#0f1117',
            border: `1px solid ${isPositiveDelta ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
            borderRadius: 12,
            padding: '18px 20px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}>
            <div style={{
              color: isPositiveDelta ? '#34d399' : '#f87171',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Net Impact (Delta)
            </div>
            <div style={{
              fontSize: 32,
              fontWeight: 800,
              color: isPositiveDelta ? '#10b981' : '#ef4444',
              fontFamily: 'monospace',
              marginTop: 6,
            }}>
              {isPositiveDelta ? '+' : ''}{Number(simResult.deltaTotal).toLocaleString()}
            </div>
            <div style={{
              display: 'inline-block',
              marginTop: 4,
              fontSize: 12,
              fontWeight: 800,
              color: isPositiveDelta ? '#10b981' : '#ef4444',
              background: isPositiveDelta ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
              padding: '2px 8px',
              borderRadius: 4,
            }}>
              {isPositiveDelta ? '▲ +' : '▼ '}{simResult.percentChange}%
            </div>
          </div>
        </div>
      )}

      {/* Main Simulation Area: Sliders on Left, Tornado on Right */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
        gap: 16,
      }}>
        {/* Sliders Panel */}
        <div style={{
          background: '#ffffff',
          borderRadius: 12,
          padding: '20px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
              Operational Driver Levers
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              Range: -50% to +100%
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {config.drivers.map((driver) => {
              const val = adjustments[driver.name] ?? 0;
              const isPositive = val > 0;
              const isNegative = val < 0;

              return (
                <div
                  key={driver.name}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        {driver.label}
                      </span>
                      <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>
                        (Avg: {Number(driver.currentAvg).toLocaleString()})
                      </span>
                    </div>

                    <span style={{
                      fontSize: 13,
                      fontWeight: 800,
                      fontFamily: 'monospace',
                      color: isPositive ? '#2563eb' : isNegative ? '#dc2626' : '#64748b',
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

                  {/* Quick Preset Buttons */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {[-25, -10, 0, 10, 25, 50].map(preset => (
                      <button
                        key={preset}
                        onClick={() => handleSliderChange(driver.name, preset)}
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: 4,
                          border: '1px solid #cbd5e1',
                          background: val === preset ? '#eff6ff' : '#ffffff',
                          color: val === preset ? '#2563eb' : '#475569',
                          cursor: 'pointer',
                        }}
                      >
                        {preset > 0 ? `+${preset}%` : preset === 0 ? '0%' : `${preset}%`}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tornado Sensitivity Chart */}
        <div style={{
          background: '#0f1117',
          borderRadius: 12,
          padding: '16px',
          border: '1px solid #1e2337',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div ref={tornadoChartRef} style={{ width: '100%', height: 260 }} />

          {/* Strategic Narrative Recommendation */}
          {topDriver && (
            <div style={{
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: 8,
              padding: '10px 14px',
              marginTop: 12,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>💡 Strategic Driver Recommendation:</span>
              </div>
              <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4, lineHeight: 1.5 }}>
                <b>{topDriver.driverName.replace(/_/g, ' ')}</b> is your primary operational growth lever. A standard <b>+10% shift</b> in this driver generates an estimated <b>+{Number(topDriver.impactPerTenPercent).toLocaleString()}</b> in {targetCol}.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
