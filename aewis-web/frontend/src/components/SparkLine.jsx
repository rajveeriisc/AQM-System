export default function SparkLine({ data = [], color = '#22C55E', height = 24 }) {
  if (!data || data.length < 2) {
    return <div style={{ height }} className="bg-gray-800 rounded" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 100;
  const h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });

  const polyline = pts.join(' ');
  // Fill area
  const area = `${pts[0]} ${pts.join(' ')} ${w},${h} 0,${h}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <polygon points={area} fill={color} fillOpacity="0.15" />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
