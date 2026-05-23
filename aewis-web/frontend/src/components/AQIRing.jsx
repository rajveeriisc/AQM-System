import { aqiColor, aqiLabel } from '../utils/thresholds';

export default function AQIRing({ aqi, size = 160 }) {
  const color = aqiColor(aqi);
  const label = aqiLabel(aqi);
  const pct = aqi != null ? Math.min(aqi / 500, 1) : 0;

  const R = 54;
  const cx = 70, cy = 70;
  const circumference = 2 * Math.PI * R;
  // Arc fills clockwise from top
  const strokeDashoffset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size }}>
      <svg viewBox="0 0 140 140" width={size} height={size}>
        {/* Background ring */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#1F2937" strokeWidth="12" />
        {/* Value ring */}
        <circle
          cx={cx} cy={cy} r={R}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.5s ease' }}
        />
        {/* AQI number */}
        <text x={cx} y={cy - 8} textAnchor="middle"
          style={{ fontSize: '32px', fontWeight: 700, fill: '#F9FAFB', fontFamily: 'monospace' }}>
          {aqi ?? '—'}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle"
          style={{ fontSize: '10px', fill: '#9CA3AF' }}>
          AQI
        </text>
      </svg>
      <span className="text-sm font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}
