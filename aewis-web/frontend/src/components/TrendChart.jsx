import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { GAS_META, GAS_KEYS } from '../utils/thresholds';
import useStore from '../store';

Chart.register(...registerables);

const GAS_COLORS = {
  pm1:  '#FB923C',
  pm25: '#F97316',
  pm10: '#EA580C',
  co:   '#EF4444',
  no2:  '#A855F7',
  co2:  '#3B82F6',
  o3:   '#06B6D4',
  voc:  '#10B981',
};

export default function TrendChart({ history = [], timeRange = '1H', gasKey = null }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const theme = useStore((s) => s.theme);
  const isDark = theme === 'dark';
  const [hiddenGases, setHiddenGases] = useState({});

  const keys = gasKey ? [gasKey] : GAS_KEYS;

  useEffect(() => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');

    const labels = history.map((r) => new Date(r.ts).toLocaleTimeString());

    const datasets = keys.map((key) => {
      const meta = GAS_META[key];
      const color = GAS_COLORS[key] || '#6B7280';
      // Normalize to % of warn threshold unless single-gas mode
      const data = history.map((r) => {
        const v = r[key];
        if (v == null) return null;
        if (gasKey) return v; // raw value in single-gas mode
        return meta?.warn ? (v / meta.warn) * 100 : v;
      });

      return {
        label: meta?.label || key.toUpperCase(),
        data,
        borderColor: color,
        backgroundColor: color + '18',
        borderWidth: 1.5,
        fill: gasKey ? true : false,
        tension: 0.3,
        pointRadius: 0,
        hidden: hiddenGases[key] || false,
      };
    });

    if (chartRef.current) {
      chartRef.current.data.labels = labels;
      chartRef.current.data.datasets = datasets;
      // Update theme colors dynamically
      chartRef.current.options.plugins.legend.labels.color = isDark ? '#9CA3AF' : '#6B7280';
      chartRef.current.options.scales.x.ticks.color = isDark ? '#6B7280' : '#9CA3AF';
      chartRef.current.options.scales.x.grid.color = isDark ? '#1F2937' : '#E5E7EB';
      chartRef.current.options.scales.y.ticks.color = isDark ? '#6B7280' : '#9CA3AF';
      chartRef.current.options.scales.y.grid.color = isDark ? '#1F2937' : '#E5E7EB';
      chartRef.current.update('none');
      return;
    }

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: !gasKey,
            position: 'top',
            labels: { color: isDark ? '#9CA3AF' : '#6B7280', boxWidth: 12, font: { size: 11 } },
            onClick(e, legendItem, legend) {
              const key = keys[legendItem.datasetIndex];
              setHiddenGases((prev) => ({ ...prev, [key]: !prev[key] }));
              legend.chart.data.datasets[legendItem.datasetIndex].hidden = !legend.chart.data.datasets[legendItem.datasetIndex].hidden;
              legend.chart.update();
            },
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)',
            titleColor: isDark ? '#F9FAFB' : '#111827',
            bodyColor: isDark ? '#D1D5DB' : '#374151',
            borderColor: isDark ? '#374151' : '#E5E7EB',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: (ctx) => {
                const key = keys[ctx.datasetIndex];
                const meta = GAS_META[key];
                const v = ctx.parsed.y;
                if (v == null) return '';
                if (gasKey) return `${meta?.label}: ${v?.toFixed(2)} ${meta?.unit}`;
                return `${meta?.label}: ${v?.toFixed(1)}% of threshold`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: isDark ? '#6B7280' : '#9CA3AF', maxTicksLimit: 8, font: { size: 10 } },
            grid: { color: isDark ? '#1F2937' : '#E5E7EB' },
          },
          y: {
            ticks: { color: isDark ? '#6B7280' : '#9CA3AF', font: { size: 10 } },
            grid: { color: isDark ? '#1F2937' : '#E5E7EB' },
            ...(gasKey
              ? {}
              : {
                  // Add 100% line = warning threshold
                  afterDataLimits: (axis) => { axis.max = Math.max(axis.max, 120); },
                }),
          },
        },
      },
    });

    // Add 100% threshold annotation for normalized view
    if (!gasKey && chartRef.current) {
      // drawn via plugin if needed — skip for simplicity
    }

    return () => {};
  }, [history, gasKey, isDark]);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', height: '220px', width: '100%' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
