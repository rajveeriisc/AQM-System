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
      setDayHistory(data.map((h) => ({ ts: `${dateStr}T${String(h.hour).padStart(2, '0')}:00:00Z`, aqi: h.avgAqi, pm1: h.avgPm1, pm25: h.avgPm25, pm10: h.avgPm10, co: h.avgCo, no2: h.avgNo2, co2: h.avgCo2, o3: h.avgO3, voc: h.avgVoc })));
    } catch (e) { console.error(e); }
  }

  // Build heatmap grid (12 months × 31 days)
  const heatmapMap = {};
  for (const d of heatmap) {
    heatmapMap[`${d.month}-${d.day}`] = d.avgAqi;
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="min-h-screen transition-colors duration-300">
      <header className="flex items-center gap-4 px-6 py-4 bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 transition-colors duration-300">
        <Link to="/" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white text-sm transition-colors">← Dashboard</Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white drop-shadow-sm">History</h1>
        <button onClick={() => setShowExport(true)}
          className="ml-auto px-5 py-2 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-all duration-300">
          Export
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Calendar heatmap */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors duration-300">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">AQI Heatmap — {new Date().getFullYear()} <span className="font-normal normal-case tracking-normal ml-2 text-xs text-gray-400 dark:text-gray-500">(click day to inspect)</span></h2>
          <div className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
            <div className="flex gap-1.5" style={{ minWidth: '700px' }}>
              {months.map((m) => (
                <div key={m} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 text-center uppercase tracking-wider mb-1">{new Date(2000, m - 1).toLocaleString('default', { month: 'short' })}</span>
                  {Array.from({ length: 31 }, (_, d) => d + 1).map((d) => {
                    const aqi = heatmapMap[`${m}-${d}`];
                    // Base color logic: In light mode, a missing day is very light gray. In dark mode, it's dark gray.
                    // We'll use a CSS variable or rely on inline style.
                    const isEmpty = aqi == null;
                    const defaultBg = isEmpty ? '' : aqiColor(aqi);

                    return (
                      <div
                        key={d}
                        title={!isEmpty ? `${new Date(2000, m - 1, d).toDateString()}: AQI ${aqi?.toFixed(0)}` : ''}
                        onClick={() => !isEmpty && loadDay(m, d)}
                        className={`w-3.5 h-3.5 rounded-sm transition-transform hover:scale-110 ${isEmpty ? 'bg-gray-100 dark:bg-gray-800 cursor-default' : 'cursor-pointer hover:ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-900 ring-gray-400 shadow-sm'}`}
                        style={{ backgroundColor: !isEmpty ? defaultBg : undefined }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {selectedDay && dayHistory.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Hourly trend for <span className="text-blue-600 dark:text-blue-400">{selectedDay}</span></h3>
              <TrendChart history={dayHistory} />
            </div>
          )}
        </div>

        {/* Date range picker */}
        <div className="flex flex-wrap gap-4 items-end bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors duration-300">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="block mt-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="block mt-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all" />
          </div>
        </div>

        {/* Trend chart */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors duration-300">
          {loading ? (
            <div className="h-64 flex items-center justify-center">
               <div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin"></div>
            </div>
          ) : (
            <TrendChart history={history} />
          )}
        </div>

        {/* Stats table */}
        {stats && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 overflow-x-auto shadow-sm transition-colors duration-300">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Summary Statistics</h2>
            <table className="w-full text-sm text-gray-600 dark:text-gray-400">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left py-3 pr-4 font-semibold text-gray-900 dark:text-white uppercase tracking-wider text-xs">Pollutant</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-900 dark:text-white uppercase tracking-wider text-xs">Min</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-900 dark:text-white uppercase tracking-wider text-xs">Avg</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-900 dark:text-white uppercase tracking-wider text-xs">Max</th>
                </tr>
              </thead>
              <tbody>
                {['pm1', 'pm25', 'pm10', 'co', 'no2', 'co2', 'o3', 'voc', 'aqi'].map((key) => (
                  stats[key] && (
                    <tr key={key} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-3 pr-4 font-bold text-gray-900 dark:text-white">{key.toUpperCase()}</td>
                      <td className="text-right px-3 font-mono font-medium text-gray-700 dark:text-gray-300">{fmt(stats[key].min, 2)}</td>
                      <td className="text-right px-3 font-mono font-medium text-gray-700 dark:text-gray-300">{fmt(stats[key].avg, 2)}</td>
                      <td className="text-right px-3 font-mono font-medium text-gray-700 dark:text-gray-300">{fmt(stats[key].max, 2)}</td>
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
