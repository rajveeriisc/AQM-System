import { useNavigate } from 'react-router-dom';
import { GAS_META, getStatus } from '../utils/thresholds';
import { fmt } from '../utils/formatters';
import SparkLine from './SparkLine';

export default function GasGauge({ gasKey, value, history = [] }) {
  const navigate = useNavigate();
  const meta = GAS_META[gasKey];
  if (!meta) return null;

  const status = getStatus(gasKey, value);
  const pct = value != null ? Math.min((value / meta.max) * 100, 100) : 0;
  const sparkData = history.map((r) => r[gasKey]).filter((v) => v != null).slice(-60);

  // SVG arc gauge — 180° arc
  const R = 36;
  const cx = 50, cy = 50;
  const startAngle = -180;
  const endAngle = 0;
  const arcAngle = startAngle + (pct / 100) * 180;

  function polarToXY(angle, r) {
    const rad = (angle * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  }

  const start = polarToXY(startAngle, R);
  const end = polarToXY(arcAngle, R);
  const largeArc = pct > 50 ? 1 : 0;

  const arcPath = `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  const bgPath = `M ${polarToXY(startAngle, R).x} ${polarToXY(startAngle, R).y} A ${R} ${R} 0 1 1 ${polarToXY(endAngle, R).x} ${polarToXY(endAngle, R).y}`;

  return (
    <div
      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 cursor-pointer hover:shadow-md hover:border-blue-400 dark:hover:border-gray-600 transition-all duration-300 flex flex-col gap-2 group"
      onClick={() => navigate(`/gas/${gasKey}`)}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{meta.label}</span>
          <span className="ml-2 text-xs text-gray-400 dark:text-gray-600">{meta.chip}</span>
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded"
          style={{ background: status.color + '22', color: status.color }}
        >
          {status.badge}
        </span>
      </div>

      {/* SVG Gauge */}
      <div className="flex justify-center relative scale-100 group-hover:scale-105 transition-transform duration-300">
        <svg viewBox="0 0 100 60" className="w-32 h-20">
          {/* Background arc */}
          <path d={bgPath} fill="none" className="stroke-gray-200 dark:stroke-gray-800" strokeWidth="8" strokeLinecap="round" />
          {/* Value arc */}
          {value != null && (
            <path d={arcPath} fill="none" stroke={status.color} strokeWidth="8" strokeLinecap="round" />
          )}
          {/* Value text */}
          <text x={cx} y={cy - 2} textAnchor="middle" className="font-mono fill-gray-900 dark:fill-white" style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmt(value, (gasKey === 'o3' || gasKey === 'no2') ? 3 : (gasKey === 'voc' || gasKey === 'co2') ? 0 : 1)}
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" className="fill-gray-500 dark:fill-gray-400" style={{ fontSize: '7px' }}>
            {meta.unit}
          </text>
        </svg>
      </div>

      {/* Sparkline */}
      <SparkLine data={sparkData} color={status.color} />
    </div>
  );
}
