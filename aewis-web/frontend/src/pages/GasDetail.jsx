import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import useStore from '../store';
import TrendChart from '../components/TrendChart';
import { GAS_META } from '../utils/thresholds';
import { fmt } from '../utils/formatters';
import ExportModal from '../components/ExportModal';
import client from '../api/client';

const TIME_RANGES = ['1H', '6H', '24H', '7D', '30D'];
const RANGE_HOURS = { '1H': 1, '6H': 6, '24H': 24, '7D': 168, '30D': 720 };

export default function GasDetail() {
  const { gasKey } = useParams();
  const selectedDeviceId = useStore((s) => s.selectedDeviceId);
  const meta = GAS_META[gasKey];

  const [timeRange, setTimeRange] = useState('24H');
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [showExport, setShowExport] = useState(false);

  useEffect(() => {
    if (!selectedDeviceId || !meta) return;

    const hours = RANGE_HOURS[timeRange];
    const from = new Date(Date.now() - hours * 3600000).toISOString();
    const to = new Date().toISOString();

    client.get('/readings', { params: { deviceId: selectedDeviceId, from, to, limit: 2000 } })
      .then(({ data }) => setHistory(data.reverse()))
      .catch(console.error);

    client.get('/readings/stats', { params: { deviceId: selectedDeviceId, from, to } })
      .then(({ data }) => setStats(data))
      .catch(console.error);

    client.get('/alerts', { params: { deviceId: selectedDeviceId, pollutant: gasKey } })
      .then(({ data }) => setAlerts(data))
      .catch(console.error);
  }, [selectedDeviceId, timeRange, gasKey]);

  if (!meta) return <div className="p-8 text-white">Unknown gas: {gasKey}</div>;

  const gasStats = stats?.[gasKey];
  const whoGuideline = meta.whoGuideline;
  const avgVal = gasStats?.avg;
  const whoComparison = avgVal != null && whoGuideline
    ? ((avgVal / whoGuideline) * 100).toFixed(0)
    : null;

  return (
    <div className="min-h-screen transition-colors duration-300">
      <header className="flex items-center gap-4 px-6 py-4 bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 transition-colors duration-300">
        <Link to="/" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white text-sm transition-colors">← Dashboard</Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white drop-shadow-sm">{meta.label} Detail</h1>
        <span className="text-gray-500 dark:text-gray-400 text-sm bg-gray-100 dark:bg-gray-800/50 px-2 py-0.5 rounded-lg border border-gray-200 dark:border-gray-700/50">{meta.chip} · {meta.unit}</span>
        <button onClick={() => setShowExport(true)}
          className="ml-auto px-5 py-2 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white shadow-sm hover:shadow transition-all duration-300">
          Export CSV
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Time range */}
        <div className="flex gap-1">
          {TIME_RANGES.map((r) => (
            <button key={r} onClick={() => setTimeRange(r)}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${timeRange === r ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'}`}>
              {r}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors duration-300">
          {/* WHO/EPA threshold lines are visual guides */}
          <TrendChart history={history} gasKey={gasKey} timeRange={timeRange} />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Min', value: fmt(gasStats?.min, 2) },
            { label: 'Max', value: fmt(gasStats?.max, 2) },
            { label: 'Avg', value: fmt(gasStats?.avg, 2) },
            { label: 'Current', value: history.length ? fmt(history[history.length - 1]?.[gasKey], 2) : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 text-center shadow-sm hover:shadow-md transition-all duration-300">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
              <p className="text-2xl font-mono font-bold text-gray-900 dark:text-white mt-1 drop-shadow-sm">{value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-500">{meta.unit}</p>
            </div>
          ))}
        </div>

        {/* Health + WHO info */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors duration-300">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-300 mb-2">About {meta.label}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{meta.description}</p>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-300 mt-4 mb-1">Health Impact</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">{meta.healthImpact}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors duration-300">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-300 mb-4">WHO Guideline Comparison</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600 dark:text-gray-400">Your {timeRange} avg</span>
                <span className="font-mono font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{fmt(avgVal, 2)} {meta.unit}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600 dark:text-gray-400">WHO guideline</span>
                <span className="font-mono font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded">{meta.whoGuideline} {meta.unit}</span>
              </div>
              {whoComparison && (
                <div className="mt-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center">
                  <span className={`font-bold text-2xl drop-shadow-sm ${parseInt(whoComparison) > 100 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {whoComparison}%
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 text-xs mt-1 uppercase tracking-wider font-medium">of WHO guideline</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alert history */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors duration-300">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-300 mb-4">Alert History for {meta.label}</h3>
          {!alerts.length ? (
            <p className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl text-center border border-gray-100 dark:border-gray-800">No alerts in this period.</p>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 10).map((a) => (
                <div key={a.id} className="flex items-center gap-4 text-xs bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800 transition-colors">
                  <span className={`px-2 py-1 rounded font-bold shadow-sm ${a.level === 'CRITICAL' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'}`}>
                    {a.level}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 font-mono">{new Date(a.ts).toLocaleString()}</span>
                  <span className="text-gray-900 dark:text-white font-medium">Value: {a.value?.toFixed(2)}</span>
                  <span className="text-gray-500">Threshold: {a.threshold?.toFixed(2)}</span>
                  <span className={`ml-auto px-2 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold ${a.acknowledged ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-500'}`}>
                    {a.acknowledged ? 'Acknowledged' : 'Active'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showExport && <ExportModal deviceId={selectedDeviceId} onClose={() => setShowExport(false)} />}
    </div>
  );
}
