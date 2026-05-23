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
      className="bg-gray-900 border border-gray-700 rounded-xl p-4 cursor-pointer hover:border-gray-500 transition-colors flex flex-col gap-2"
      onClick={() => navigate(`/gas/${gasKey}`)}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{meta.label}</span>
          <span className="ml-2 text-xs text-gray-600">{meta.chip}</span>
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded"
          style={{ background: status.color + '22', color: status.color }}
        >
          {status.badge}
        </span>
      </div>

      {/* SVG Gauge */}
      <div className="flex justify-center">
        <svg viewBox="0 0 100 60" className="w-32 h-20">
          {/* Background arc */}
          <path d={bgPath} fill="none" stroke="#1F2937" strokeWidth="8" strokeLinecap="round" />
          {/* Value arc */}
          {value != null && (
            <path d={arcPath} fill="none" stroke={status.color} strokeWidth="8" strokeLinecap="round" />
          )}
          {/* Value text */}
          <text x={cx} y={cy - 2} textAnchor="middle" className="font-mono" style={{ fontSize: '14px', fill: '#F9FAFB', fontWeight: 700, fontFamily: 'monospace' }}>
            {fmt(value, (gasKey === 'o3' || gasKey === 'no2') ? 3 : (gasKey === 'voc' || gasKey === 'co2') ? 0 : 1)}
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" style={{ fontSize: '7px', fill: '#9CA3AF' }}>
            {meta.unit}
          </text>
        </svg>
      </div>

      {/* Sparkline */}
      <SparkLine data={sparkData} color={status.color} />

      {/* Status text */}
      <p className="text-xs text-center" style={{ color: status.color }}>{status.level}</p>
    </div>
  );
}
