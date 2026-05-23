export function fmt(value, decimals = 1) {
  if (value == null || isNaN(value)) return '—';
  return Number(value).toFixed(decimals);
}

export function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

export function fmtDateShort(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}

export function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString();
}

export function fmtRelative(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function celsiusToFahrenheit(c) {
  return (c * 9) / 5 + 32;
}
