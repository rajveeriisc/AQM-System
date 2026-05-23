import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import useStore from '../store';
import TrendChart from '../components/TrendChart';
import ExportModal from '../components/ExportModal';
import { fmt } from '../utils/formatters';
import { aqiColor } from '../utils/thresholds';
import client from '../api/client';

export default function History() {
  const selectedDeviceId = useStore((s) => s.selectedDeviceId);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayHistory, setDayHistory] = useState([]);
  const [showExport, setShowExport] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedDeviceId) return;
    const year = new Date().getFullYear();
    client.get('/readings/heatmap', { params: { deviceId: selectedDeviceId, year } })
      .then(({ data }) => setHeatmap(data))
      .catch(console.error);
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!selectedDeviceId || !from || !to) return;
    setLoading(true);
    const fromISO = new Date(from).toISOString();
    const toISO = new Date(to + 'T23:59:59').toISOString();

    Promise.all([
      client.get('/readings', { params: { deviceId: selectedDeviceId, from: fromISO, to: toISO, limit: 2000 } }),
      client.get('/readings/stats', { params: { deviceId: selectedDeviceId, from: fromISO, to: toISO } }),
    ]).then(([rRes, sRes]) => {
      setHistory(rRes.data.reverse());
      setStats(sRes.data);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedDeviceId, from, to]);

  async function loadDay(month, day) {
    if (!selectedDeviceId) return;
    const year = new Date().getFullYear();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDay(dateStr);
    try {
      const { data } = await client.get('/readings/hourly', { params: { deviceId: selectedDeviceId, date: dateStr } });
      setDayHistory(data.map((h) => ({ ts: `${dateStr}T${String(h.hour).padStart(2, '0')}:00:00Z`, aqi: h.avgAqi, pm25: h.avgPm25, co: h.avgCo, no2: h.avgNo2, co2: h.avgCo2, o3: h.avgO3, voc: h.avgVoc })));
    } catch (e) { console.error(e); }
  }

  // Build heatmap grid (12 months × 31 days)
  const heatmapMap = {};
  for (const d of heatmap) {
    heatmapMap[`${d.month}-${d.day}`] = d.avgAqi;
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="flex items-center gap-4 px-6 py-4 bg-gray-900 border-b border-gray-800">
        <Link to="/" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
        <h1 className="text-xl font-bold">History</h1>
        <button onClick={() => setShowExport(true)}
          className="ml-auto px-4 py-1.5 text-sm bg-gray-800 border border-gray-600 rounded-lg hover:bg-gray-700">
          Export
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Calendar heatmap */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">AQI Heatmap — {new Date().getFullYear()} (click day to inspect)</h2>
          <div className="overflow-x-auto">
            <div className="flex gap-1" style={{ minWidth: '700px' }}>
              {months.map((m) => (
                <div key={m} className="flex flex-col gap-0.5">
                  <span className="text-xs text-gray-600 text-center">{new Date(2000, m - 1).toLocaleString('default', { month: 'short' })}</span>
                  {Array.from({ length: 31 }, (_, d) => d + 1).map((d) => {
                    const aqi = heatmapMap[`${m}-${d}`];
                    const bg = aqi != null ? aqiColor(aqi) : '#1F2937';
                    return (
                      <div
                        key={d}
                        title={aqi != null ? `${new Date(2000, m - 1, d).toDateString()}: AQI ${aqi?.toFixed(0)}` : ''}
                        onClick={() => aqi != null && loadDay(m, d)}
                        style={{ background: bg + (aqi != null ? 'CC' : ''), width: 14, height: 14, borderRadius: 2, cursor: aqi != null ? 'pointer' : 'default' }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {selectedDay && dayHistory.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs text-gray-400 mb-2">Hourly trend for {selectedDay}</h3>
              <TrendChart history={dayHistory} />
            </div>
          )}
        </div>

        {/* Date range picker */}
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-gray-400">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="block mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-gray-400">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="block mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white" />
          </div>
        </div>

        {/* Trend chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          {loading ? (
            <div className="h-48 flex items-center justify-center text-gray-500 text-sm">Loading...</div>
          ) : (
            <TrendChart history={history} />
          )}
        </div>

        {/* Stats table */}
        {stats && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-x-auto">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">Summary Statistics</h2>
            <table className="w-full text-xs text-gray-400">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 pr-4">Pollutant</th>
                  <th className="text-right py-2 px-2">Min</th>
                  <th className="text-right py-2 px-2">Avg</th>
                  <th className="text-right py-2 px-2">Max</th>
                </tr>
              </thead>
              <tbody>
                {['pm25', 'pm10', 'co', 'no2', 'co2', 'o3', 'voc', 'aqi'].map((key) => (
                  stats[key] && (
                    <tr key={key} className="border-b border-gray-800/50">
                      <td className="py-1.5 pr-4 font-medium text-gray-300">{key.toUpperCase()}</td>
                      <td className="text-right px-2 font-mono">{fmt(stats[key].min, 2)}</td>
                      <td className="text-right px-2 font-mono">{fmt(stats[key].avg, 2)}</td>
                      <td className="text-right px-2 font-mono">{fmt(stats[key].max, 2)}</td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showExport && <ExportModal deviceId={selectedDeviceId} onClose={() => setShowExport(false)} />}
    </div>
  );
}
