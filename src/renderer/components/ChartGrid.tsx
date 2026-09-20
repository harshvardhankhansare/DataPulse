import { useEffect, useRef, useState, useMemo } from 'react';
import * as echarts from 'echarts';
import { ChartConfig, ChartType, ChartDataPoint } from '../../core/charts/chartTypes';
import { ActiveFilter } from '../../core/analytics/filterTypes';

interface ChartGridProps {
  charts: ChartConfig[];
  onFilterSelect?: (filter: ActiveFilter) => void;
  activeFilter?: ActiveFilter | null;
}

const COLOR_PALETTE = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899',
  '#06b6d4', '#6366f1', '#14b8a6', '#f97316', '#a855f7'
];

type SortOrder = 'default' | 'desc' | 'asc';
type MetricScenario = 'avg' | 'sum';

const TYPE_ICONS: Record<ChartType, { icon: string; label: string }> = {
  bar: { icon: '📊', label: 'Bar' },
  horizontal_bar: { icon: '↔️', label: 'H-Bar' },
  donut: { icon: '🍩', label: 'Donut' },
  pie: { icon: '🥧', label: 'Pie' },
  line: { icon: '📉', label: 'Line' },
  area: { icon: '📈', label: 'Area' },
  radar: { icon: '🕸️', label: 'Radar' },
  funnel: { icon: '🔻', label: 'Funnel' },
  scatter: { icon: '🔵', label: 'Scatter' },
  histogram: { icon: '📶', label: 'Histogram' },
  waterfall: { icon: '🪜', label: 'Waterfall' },
};

/** Individual interactive chart card with mobility controls and big readable numbers */
export function ChartCard({
  config,
  onFilterSelect,
  activeFilter,
}: {
  config: ChartConfig;
  onFilterSelect?: (filter: ActiveFilter) => void;
  activeFilter?: ActiveFilter | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  // Available chart types to switch between
  const availableTypes: ChartType[] = useMemo(() => {
    if (config.availableTypes && config.availableTypes.length > 0) {
      return config.availableTypes;
    }
    if (config.chartType === 'scatter') return ['scatter'];
    if (config.chartType === 'histogram') return ['histogram', 'bar', 'area', 'line'];
    if (config.chartType === 'line' || config.chartType === 'area') return ['area', 'line', 'bar'];
    return ['donut', 'bar', 'horizontal_bar', 'pie', 'radar', 'funnel'];
  }, [config]);

  const [activeType, setActiveType] = useState<ChartType>(config.chartType);
  const [sortOrder, setSortOrder] = useState<SortOrder>('default');
  const [metricScenario, setMetricScenario] = useState<MetricScenario>('avg');

  // Has sum/total value scenario
  const hasMultipleMetrics = Boolean(config.data && config.data.some(d => d.value2 !== undefined));

  // Process data based on sorting and metric scenario
  const processedData: ChartDataPoint[] = useMemo(() => {
    if (!config.data) return [];
    let list = config.data.map(d => ({
      label: d.label,
      value: (metricScenario === 'sum' && d.value2 !== undefined) ? d.value2 : d.value,
      value2: d.value2,
    }));

    if (sortOrder === 'desc') {
      list = [...list].sort((a, b) => b.value - a.value);
    } else if (sortOrder === 'asc') {
      list = [...list].sort((a, b) => a.value - b.value);
    }
    return list;
  }, [config.data, sortOrder, metricScenario]);

  // Compute big summary numbers for quick glance
  const quickStats = useMemo(() => {
    if (!processedData || processedData.length === 0) return null;
    const values = processedData.map(d => d.value);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const avg = sum / values.length;
    const max = Math.max(...values);
    return {
      total: Number(sum.toFixed(2)).toLocaleString(),
      avg: Number(avg.toFixed(2)).toLocaleString(),
      max: Number(max.toFixed(2)).toLocaleString(),
      count: values.length,
    };
  }, [processedData]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(containerRef.current);
    }
    const chart = chartInstanceRef.current;
    let option: echarts.EChartsOption;

    const metricTitle = metricScenario === 'sum' && hasMultipleMetrics ? 'Total Sum' : config.yAxisLabel;

    if (activeType === 'scatter' && config.scatterData) {
      option = {
        backgroundColor: '#0f1117',
        title: {
          text: config.title,
          left: 16,
          top: 12,
          textStyle: { color: '#f1f5f9', fontSize: 14, fontWeight: 700 },
        },
        tooltip: {
          trigger: 'item',
          backgroundColor: '#1e2440',
          borderColor: '#3b82f6',
          borderWidth: 1.5,
          textStyle: { color: '#f8fafc', fontSize: 13 },
          formatter: (params: any) => {
            const [x, y] = params.data as [number, number];
            return `<div style="padding:4px"><b>${config.xAxisLabel}:</b> <span style="font-size:15px;color:#38bdf8;font-weight:bold">${x}</span><br/><b>${config.yAxisLabel}:</b> <span style="font-size:15px;color:#38bdf8;font-weight:bold">${y}</span></div>`;
          },
        },
        grid: { left: '12%', right: '8%', top: 55, bottom: 45 },
        xAxis: {
          type: 'value',
          name: config.xAxisLabel,
          nameLocation: 'middle',
          nameGap: 26,
          nameTextStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 },
          axisLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: 600 },
          splitLine: { lineStyle: { color: '#1e2337' } },
        },
        yAxis: {
          type: 'value',
          name: config.yAxisLabel,
          nameLocation: 'middle',
          nameGap: 36,
          nameTextStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 },
          axisLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: 600 },
          splitLine: { lineStyle: { color: '#1e2337' } },
        },
        series: [
          {
            type: 'scatter',
            symbolSize: 12,
            data: config.scatterData.map(p => [p.x, p.y]),
            itemStyle: {
              color: '#38bdf8',
              borderColor: '#0284c7',
              borderWidth: 1.5,
              shadowBlur: 8,
              shadowColor: 'rgba(56,189,248,0.4)',
            },
            emphasis: {
              itemStyle: { color: '#7dd3fc', borderColor: '#38bdf8', borderWidth: 2 },
            },
          },
        ],
      };
    } else if (activeType === 'donut') {
      const pieData = processedData.map((d, i) => ({
        name: d.label,
        value: d.value,
        itemStyle: { color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
      }));

      const totalValue = processedData.reduce((acc, d) => acc + d.value, 0);

      option = {
        backgroundColor: '#0f1117',
        title: [
          {
            text: config.title,
            subtext: `${metricTitle} Share`,
            left: 16,
            top: 12,
            textStyle: { color: '#f1f5f9', fontSize: 14, fontWeight: 700 },
            subtextStyle: { color: '#94a3b8', fontSize: 12 },
          },
          {
            text: totalValue > 0 ? Number(totalValue.toFixed(1)).toLocaleString() : '',
            subtext: 'TOTAL',
            left: '34%',
            top: '48%',
            textAlign: 'center',
            textStyle: {
              color: '#ffffff',
              fontSize: 22,
              fontWeight: 800,
              fontFamily: 'monospace',
            },
            subtextStyle: {
              color: '#60a5fa',
              fontSize: 11,
              fontWeight: 700,
            },
          },
        ],
        tooltip: {
          trigger: 'item',
          backgroundColor: '#1e2440',
          borderColor: '#3b82f6',
          borderWidth: 1.5,
          textStyle: { color: '#f8fafc', fontSize: 13 },
          formatter: (params: any) => {
            return `<div style="padding:4px"><b>${params.name}</b><br/><span style="font-size:16px;color:#38bdf8;font-weight:bold">${Number(params.value).toLocaleString()}</span> (${params.percent}%)</div>`;
          },
        },
        legend: {
          type: 'scroll',
          orient: 'vertical',
          right: 12,
          top: 36,
          bottom: 16,
          itemWidth: 18,
          itemHeight: 18,
          itemGap: 12,
          textStyle: {
            color: '#f8fafc',
            fontSize: 14,
            fontWeight: 700,
          },
          formatter: (name: string) => {
            const item = pieData.find(d => d.name === name);
            if (!item) return name;
            const pct = totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0;
            return `${name}  —  ${Number(item.value).toLocaleString()} (${pct}%)`;
          },
        },
        series: [
          {
            type: 'pie',
            radius: ['45%', '72%'],
            center: ['34%', '55%'],
            avoidLabelOverlap: true,
            itemStyle: {
              borderRadius: 6,
              borderColor: '#0f1117',
              borderWidth: 2,
            },
            label: {
              show: true,
              position: 'outside',
              formatter: '{c}',
              color: '#f8fafc',
              fontSize: 14,
              fontWeight: 800,
            },
            labelLine: {
              show: true,
              length: 10,
              length2: 12,
              lineStyle: { color: '#64748b' },
            },
            emphasis: {
              itemStyle: {
                shadowBlur: 15,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.7)',
              },
            },
            data: pieData,
          },
        ],
      };
    } else if (activeType === 'pie') {
      const pieData = processedData.map((d, i) => ({
        name: d.label,
        value: d.value,
        itemStyle: { color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
      }));

      const totalValue = processedData.reduce((acc, d) => acc + d.value, 0);

      option = {
        backgroundColor: '#0f1117',
        title: {
          text: config.title,
          subtext: metricTitle,
          left: 16,
          top: 12,
          textStyle: { color: '#f1f5f9', fontSize: 14, fontWeight: 700 },
          subtextStyle: { color: '#94a3b8', fontSize: 12 },
        },
        tooltip: {
          trigger: 'item',
          backgroundColor: '#1e2440',
          borderColor: '#3b82f6',
          borderWidth: 1.5,
          textStyle: { color: '#f8fafc', fontSize: 13 },
          formatter: (params: any) => {
            return `<div style="padding:4px"><b>${params.name}</b><br/><span style="font-size:16px;color:#38bdf8;font-weight:bold">${Number(params.value).toLocaleString()}</span> (${params.percent}%)</div>`;
          },
        },
        legend: {
          type: 'scroll',
          orient: 'vertical',
          right: 12,
          top: 36,
          bottom: 16,
          itemWidth: 18,
          itemHeight: 18,
          itemGap: 12,
          textStyle: {
            color: '#f8fafc',
            fontSize: 14,
            fontWeight: 700,
          },
          formatter: (name: string) => {
            const item = pieData.find(d => d.name === name);
            if (!item) return name;
            const pct = totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0;
            return `${name}  —  ${Number(item.value).toLocaleString()} (${pct}%)`;
          },
        },
        series: [
          {
            type: 'pie',
            radius: '68%',
            center: ['34%', '55%'],
            roseType: processedData.length > 8 ? 'area' : undefined,
            itemStyle: {
              borderRadius: 5,
              borderColor: '#0f1117',
              borderWidth: 2,
            },
            label: {
              show: true,
              formatter: '{c}',
              color: '#f8fafc',
              fontSize: 14,
              fontWeight: 800,
            },
            data: pieData,
          },
        ],
      };
    } else if (activeType === 'horizontal_bar') {
      option = {
        backgroundColor: '#0f1117',
        title: {
          text: config.title,
          left: 16,
          top: 12,
          textStyle: { color: '#f1f5f9', fontSize: 14, fontWeight: 700 },
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          backgroundColor: '#1e2440',
          borderColor: '#3b82f6',
          borderWidth: 1.5,
          textStyle: { color: '#f8fafc', fontSize: 13 },
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params;
            return `<b>${p.name}</b><br/>${metricTitle}: <b style="font-size:16px;color:#38bdf8">${Number(p.value).toLocaleString()}</b>`;
          },
        },
        grid: { left: '22%', right: '14%', top: 50, bottom: 35 },
        xAxis: {
          type: 'value',
          axisLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: 600 },
          splitLine: { lineStyle: { color: '#1e2337' } },
        },
        yAxis: {
          type: 'category',
          data: processedData.map(d => d.label),
          inverse: true,
          axisLabel: {
            color: '#f1f5f9',
            fontSize: 13,
            fontWeight: 600,
            overflow: 'truncate',
            width: 95,
          },
          axisLine: { lineStyle: { color: '#2d3348' } },
        },
        series: [
          {
            type: 'bar',
            data: processedData.map((d, i) => ({
              value: d.value,
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                  { offset: 0, color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
                  { offset: 1, color: `${COLOR_PALETTE[i % COLOR_PALETTE.length]}99` },
                ]),
                borderRadius: [0, 5, 5, 0],
              },
            })),
            barMaxWidth: 26,
            label: {
              show: true,
              position: 'right',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 800,
              formatter: (params: any) => Number(params.value).toLocaleString(),
            },
          },
        ],
      };
    } else if (activeType === 'radar') {
      const maxVal = Math.max(...processedData.map(d => d.value), 1);
      option = {
        backgroundColor: '#0f1117',
        title: {
          text: config.title,
          left: 16,
          top: 12,
          textStyle: { color: '#f1f5f9', fontSize: 14, fontWeight: 700 },
        },
        tooltip: {
          trigger: 'item',
          backgroundColor: '#1e2440',
          borderColor: '#3b82f6',
          textStyle: { color: '#f8fafc', fontSize: 13 },
        },
        radar: {
          indicator: processedData.slice(0, 8).map(d => ({
            name: `${d.label}\n(${Number(d.value).toLocaleString()})`,
            max: maxVal * 1.15,
          })),
          radius: '58%',
          center: ['50%', '56%'],
          splitNumber: 4,
          axisName: { color: '#f1f5f9', fontSize: 12, fontWeight: 700 },
          splitLine: { lineStyle: { color: '#2a3554' } },
          splitArea: {
            show: true,
            areaStyle: {
              color: ['rgba(30, 36, 64, 0.4)', 'rgba(20, 24, 42, 0.6)'],
            },
          },
        },
        series: [
          {
            type: 'radar',
            data: [
              {
                value: processedData.slice(0, 8).map(d => d.value),
                name: metricTitle,
                areaStyle: {
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(59, 130, 246, 0.6)' },
                    { offset: 1, color: 'rgba(139, 92, 246, 0.2)' },
                  ]),
                },
                lineStyle: { color: '#3b82f6', width: 2.5 },
                itemStyle: { color: '#60a5fa' },
                label: {
                  show: true,
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#93c5fd',
                  formatter: (params: any) => Number(params.value).toLocaleString(),
                },
              },
            ],
          },
        ],
      };
    } else if (activeType === 'funnel') {
      const funnelData = [...processedData]
        .sort((a, b) => b.value - a.value)
        .slice(0, 7)
        .map((d, i) => ({
          name: d.label,
          value: d.value,
          itemStyle: { color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
        }));

      option = {
        backgroundColor: '#0f1117',
        title: {
          text: config.title,
          left: 16,
          top: 12,
          textStyle: { color: '#f1f5f9', fontSize: 14, fontWeight: 700 },
        },
        tooltip: {
          trigger: 'item',
          backgroundColor: '#1e2440',
          borderColor: '#3b82f6',
          textStyle: { color: '#f8fafc', fontSize: 13 },
          formatter: '{b}: <b style="font-size:16px;color:#38bdf8">{c}</b>',
        },
        series: [
          {
            type: 'funnel',
            left: '12%',
            top: 50,
            bottom: 25,
            width: '76%',
            sort: 'descending',
            gap: 3,
            label: {
              show: true,
              position: 'inside',
              color: '#ffffff',
              fontSize: 15,
              fontWeight: 800,
              formatter: '{b}: {c}',
            },
            itemStyle: {
              borderColor: '#0f1117',
              borderWidth: 2,
            },
            data: funnelData,
          },
        ],
      };
    } else if (activeType === 'line' || activeType === 'area') {
      const isArea = activeType === 'area';
      option = {
        backgroundColor: '#0f1117',
        title: {
          text: config.title,
          left: 16,
          top: 12,
          textStyle: { color: '#f1f5f9', fontSize: 14, fontWeight: 700 },
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: '#1e2440',
          borderColor: '#3b82f6',
          borderWidth: 1.5,
          textStyle: { color: '#f8fafc', fontSize: 13 },
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params;
            return `<b>${p.name}</b><br/>${metricTitle}: <b style="font-size:16px;color:#38bdf8">${Number(p.value).toLocaleString()}</b>`;
          },
        },
        grid: { left: '10%', right: '8%', top: 55, bottom: 45 },
        xAxis: {
          type: 'category',
          data: processedData.map(d => d.label),
          name: config.xAxisLabel,
          nameLocation: 'middle',
          nameGap: 30,
          nameTextStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 },
          axisLabel: {
            color: '#cbd5e1',
            fontSize: 12,
            fontWeight: 600,
            rotate: processedData.length > 6 ? 25 : 0,
          },
          axisLine: { lineStyle: { color: '#2d3348' } },
        },
        yAxis: {
          type: 'value',
          name: metricTitle,
          nameLocation: 'middle',
          nameGap: 38,
          nameTextStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 },
          axisLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: 600 },
          splitLine: { lineStyle: { color: '#1e2337' } },
        },
        series: [
          {
            type: 'line',
            smooth: true,
            data: processedData.map(d => d.value),
            itemStyle: { color: '#3b82f6' },
            lineStyle: { width: 3, color: '#3b82f6' },
            symbol: 'circle',
            symbolSize: 7,
            label: {
              show: processedData.length <= 15,
              position: 'top',
              color: '#93c5fd',
              fontSize: 14,
              fontWeight: 800,
              formatter: (p: any) => Number(p.value).toLocaleString(),
            },
            areaStyle: isArea
              ? {
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(59, 130, 246, 0.45)' },
                    { offset: 1, color: 'rgba(59, 130, 246, 0.02)' },
                  ]),
                }
              : undefined,
          },
        ],
      };
    } else {
      // Bar or Histogram
      const isHistogram = activeType === 'histogram';
      const colorStart = isHistogram ? '#f59e0b' : '#3b82f6';
      const colorEnd = isHistogram ? '#d97706' : '#1d4ed8';

      option = {
        backgroundColor: '#0f1117',
        title: {
          text: config.title,
          left: 16,
          top: 12,
          textStyle: { color: '#f1f5f9', fontSize: 14, fontWeight: 700 },
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          backgroundColor: '#1e2440',
          borderColor: '#3b82f6',
          borderWidth: 1.5,
          textStyle: { color: '#f8fafc', fontSize: 13 },
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params;
            return `<b>${p.name}</b><br/>${metricTitle}: <b style="font-size:16px;color:#38bdf8">${Number(p.value).toLocaleString()}</b>`;
          },
        },
        grid: { left: '10%', right: '8%', top: 55, bottom: 45 },
        xAxis: {
          type: 'category',
          data: processedData.map(d => d.label),
          name: config.xAxisLabel,
          nameLocation: 'middle',
          nameGap: 30,
          nameTextStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 },
          axisLabel: {
            color: '#cbd5e1',
            fontSize: 12,
            fontWeight: 600,
            rotate: processedData.length > 6 ? 25 : 0,
            overflow: 'truncate',
            width: 85,
          },
          axisLine: { lineStyle: { color: '#2d3348' } },
        },
        yAxis: {
          type: 'value',
          name: metricTitle,
          nameLocation: 'middle',
          nameGap: 38,
          nameTextStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 },
          axisLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: 600 },
          splitLine: { lineStyle: { color: '#1e2337' } },
        },
        series: [
          {
            type: 'bar',
            data: processedData.map((d, i) => ({
              value: d.value,
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: isHistogram ? colorStart : COLOR_PALETTE[i % COLOR_PALETTE.length] },
                  { offset: 1, color: isHistogram ? colorEnd : `${COLOR_PALETTE[i % COLOR_PALETTE.length]}99` },
                ]),
                borderRadius: [4, 4, 0, 0],
              },
            })),
            barMaxWidth: 44,
            label: {
              show: true,
              position: 'top',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 800,
              formatter: (params: any) => Number(params.value).toLocaleString(),
            },
          },
        ],
      };
    }

    chart.setOption(option, true);

    const handleClick = (params: any) => {
      if (params && params.name && onFilterSelect) {
        const col = config.xAxisLabel || config.sourceColumns[0];
        onFilterSelect({ column: col, value: params.name });
      }
    };
    chart.off('click');
    chart.on('click', handleClick);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      chart.off('click');
      window.removeEventListener('resize', handleResize);
    };
  }, [config, activeType, processedData, metricScenario, hasMultipleMetrics, onFilterSelect]);

  useEffect(() => {
    return () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  const handleDownloadImage = () => {
    if (!chartInstanceRef.current) return;
    const url = chartInstanceRef.current.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#0f1117',
    });
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${activeType}.png`;
    a.click();
  };

  const analysisBadge = {
    group_aggregation: { label: 'Group Aggregation', color: '#60a5fa', bg: 'rgba(59,130,246,0.12)', border: '#2563eb' },
    descriptive_stats: { label: 'Distribution & Stats', color: '#fbbf24', bg: 'rgba(245,158,11,0.12)', border: '#d97706' },
    correlation: { label: 'Correlation (Pearson)', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', border: '#0284c7' },
    time_series: { label: 'Time-Series Trend', color: '#34d399', bg: 'rgba(16,185,129,0.12)', border: '#059669' },
    ai_query: { label: 'AI Query Chart', color: '#c084fc', bg: 'rgba(168,85,247,0.12)', border: '#9333ea' },
  }[config.analysisType] || { label: config.analysisType, color: '#94a3b8', bg: '#1e2440', border: '#334155' };

  return (
    <div style={{
      background: '#0f1117',
      borderRadius: 12,
      border: '1px solid #1e2337',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      overflow: 'hidden',
    }}>
      {/* Top Controls Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        paddingBottom: 12,
        borderBottom: '1px solid #1e2337',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 99,
            color: analysisBadge.color,
            background: analysisBadge.bg,
            border: `1px solid ${analysisBadge.border}`,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            {analysisBadge.label}
          </span>
          <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>
            {config.sourceColumns.join(' × ')}
          </span>
          {activeFilter && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 6,
              background: 'rgba(59,130,246,0.2)',
              color: '#60a5fa',
              border: '1px solid #3b82f6',
            }}>
              Filtered: {String(activeFilter.value)}
            </span>
          )}
        </div>

        {/* Action icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasMultipleMetrics && (
            <div style={{
              display: 'flex',
              background: '#1a2236',
              borderRadius: 6,
              padding: 2,
              border: '1px solid #2a3554',
            }}>
              <button
                onClick={() => setMetricScenario('avg')}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: metricScenario === 'avg' ? '#3b82f6' : 'transparent',
                  color: metricScenario === 'avg' ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.12s',
                }}
              >
                Avg
              </button>
              <button
                onClick={() => setMetricScenario('sum')}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: metricScenario === 'sum' ? '#3b82f6' : 'transparent',
                  color: metricScenario === 'sum' ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.12s',
                }}
              >
                Total Sum
              </button>
            </div>
          )}

          {config.data && config.data.length > 0 && activeType !== 'scatter' && (
            <button
              onClick={() => {
                if (sortOrder === 'default') setSortOrder('desc');
                else if (sortOrder === 'desc') setSortOrder('asc');
                else setSortOrder('default');
              }}
              title={`Sort order: ${sortOrder} (click to cycle)`}
              style={{
                fontSize: 12,
                fontWeight: 600,
                background: sortOrder !== 'default' ? '#1e2a44' : '#141824',
                color: sortOrder !== 'default' ? '#60a5fa' : '#94a3b8',
                border: `1px solid ${sortOrder !== 'default' ? '#3b82f6' : '#232a3e'}`,
                borderRadius: 6,
                padding: '3px 9px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>{sortOrder === 'desc' ? '⬇ High' : sortOrder === 'asc' ? '⬆ Low' : '↕ Sort'}</span>
            </button>
          )}

          <button
            onClick={handleDownloadImage}
            title="Download Chart as PNG"
            style={{
              fontSize: 12,
              fontWeight: 600,
              background: '#141824',
              color: '#94a3b8',
              border: '1px solid #232a3e',
              borderRadius: 6,
              padding: '3px 9px',
              cursor: 'pointer',
            }}
          >
            💾 PNG
          </button>
        </div>
      </div>

      {/* Chart Switcher Mobility Bar */}
      {availableTypes.length > 1 && (
        <div style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          padding: '10px 0 6px',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginRight: 2 }}>
            Switch View:
          </span>
          {availableTypes.map(t => {
            const isSelected = activeType === t;
            const meta = TYPE_ICONS[t] || { icon: '📊', label: t };
            return (
              <button
                key={t}
                onClick={() => setActiveType(t)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 12,
                  fontWeight: isSelected ? 700 : 500,
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: isSelected ? '1px solid #3b82f6' : '1px solid #1e2440',
                  background: isSelected ? '#1e2942' : '#131722',
                  color: isSelected ? '#60a5fa' : '#94a3b8',
                  cursor: 'pointer',
                  transition: 'all 0.14s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Big Quick Stats Metric Ribbon */}
      {quickStats && activeType !== 'scatter' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          background: '#141824',
          padding: '8px 14px',
          borderRadius: 8,
          margin: '8px 0',
          border: '1px solid #1e2538',
        }}>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>TOTAL</div>
            <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: 20, fontFamily: 'monospace' }}>
              {quickStats.total}
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>AVERAGE</div>
            <div style={{ fontWeight: 800, color: '#a78bfa', fontSize: 20, fontFamily: 'monospace' }}>
              {quickStats.avg}
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>PEAK / MAX</div>
            <div style={{ fontWeight: 800, color: '#34d399', fontSize: 20, fontFamily: 'monospace' }}>
              {quickStats.max}
            </div>
          </div>
        </div>
      )}

      {/* Stats Summary Panel for Descriptive Stats */}
      {config.statsSummary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          background: '#161b2a',
          padding: '10px 14px',
          borderRadius: 8,
          margin: '8px 0',
          border: '1px solid #222b42',
        }}>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>Mean</div>
            <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: 16, fontFamily: 'monospace' }}>
              {config.statsSummary.mean}
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>Median</div>
            <div style={{ fontWeight: 800, color: '#f1f5f9', fontSize: 16, fontFamily: 'monospace' }}>
              {config.statsSummary.median}
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>Std Dev</div>
            <div style={{ fontWeight: 800, color: '#f1f5f9', fontSize: 16, fontFamily: 'monospace' }}>
              {config.statsSummary.stddev}
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>Range</div>
            <div style={{ fontWeight: 800, color: '#34d399', fontSize: 16, fontFamily: 'monospace' }}>
              {config.statsSummary.min} - {config.statsSummary.max}
            </div>
          </div>
        </div>
      )}

      {/* Correlation coefficient banner */}
      {config.correlation !== undefined && (
        <div style={{
          background: 'rgba(14, 165, 233, 0.15)',
          border: '1px solid rgba(14, 165, 233, 0.4)',
          padding: '8px 14px',
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 13,
          color: '#bae6fd',
          margin: '8px 0',
        }}>
          <span style={{ fontWeight: 600 }}>Pearson Correlation (r)</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#38bdf8', fontSize: 20 }}>
            {config.correlation}
          </span>
        </div>
      )}

      {/* ECharts Canvas Container */}
      <div ref={containerRef} style={{ width: '100%', height: 320, minHeight: 320 }} />
    </div>
  );
}

/** Full Chart Grid view with category filters and layout toggles */
export default function ChartGrid({ charts, onFilterSelect, activeFilter }: ChartGridProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [columnCount, setColumnCount] = useState<1 | 2>(2);

  if (charts.length === 0) return null;

  const categories = useMemo(() => {
    const set = new Set<string>();
    charts.forEach(c => set.add(c.analysisType));
    return Array.from(set);
  }, [charts]);

  const filteredCharts = useMemo(() => {
    if (filterType === 'all') return charts;
    return charts.filter(c => c.analysisType === filterType);
  }, [charts, filterType]);

  const CATEGORY_NAMES: Record<string, string> = {
    group_aggregation: 'Group Aggregations',
    descriptive_stats: 'Distributions',
    time_series: 'Time Series',
    correlation: 'Correlations',
    ai_query: 'AI Query Charts',
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filter and layout controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        background: '#ffffff',
        padding: '12px 18px',
        borderRadius: 10,
        border: '1px solid #e2e8f0',
      }}>
        {/* Category filter pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginRight: 4 }}>
            Scenario Filter:
          </span>
          <button
            onClick={() => setFilterType('all')}
            style={{
              padding: '4px 10px',
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              border: filterType === 'all' ? '1px solid #3b82f6' : '1px solid #e2e8f0',
              background: filterType === 'all' ? '#eff6ff' : '#f8fafc',
              color: filterType === 'all' ? '#2563eb' : '#64748b',
              transition: 'all 0.12s',
            }}
          >
            All ({charts.length})
          </button>
          {categories.map(cat => {
            const isSel = filterType === cat;
            const count = charts.filter(c => c.analysisType === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setFilterType(cat)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: isSel ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                  background: isSel ? '#eff6ff' : '#f8fafc',
                  color: isSel ? '#2563eb' : '#64748b',
                  transition: 'all 0.12s',
                }}
              >
                {CATEGORY_NAMES[cat] || cat} ({count})
              </button>
            );
          })}
        </div>

        {/* 1-col vs 2-col layout toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Layout:</span>
          <button
            onClick={() => setColumnCount(1)}
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              border: columnCount === 1 ? '1px solid #3b82f6' : '1px solid #cbd5e1',
              background: columnCount === 1 ? '#eff6ff' : '#ffffff',
              color: columnCount === 1 ? '#2563eb' : '#64748b',
            }}
          >
            Full Width
          </button>
          <button
            onClick={() => setColumnCount(2)}
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              border: columnCount === 2 ? '1px solid #3b82f6' : '1px solid #cbd5e1',
              background: columnCount === 2 ? '#eff6ff' : '#ffffff',
              color: columnCount === 2 ? '#2563eb' : '#64748b',
            }}
          >
            2 Columns
          </button>
        </div>
      </div>

      {/* Grid of chart cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: columnCount === 1 ? '1fr' : 'repeat(auto-fit, minmax(500px, 1fr))',
        gap: 16,
      }}>
        {filteredCharts.map((chart, i) => (
          <ChartCard key={`${chart.analysisType}-${chart.title}-${i}`} config={chart} onFilterSelect={onFilterSelect} activeFilter={activeFilter} />
        ))}
      </div>
    </section>
  );
}
