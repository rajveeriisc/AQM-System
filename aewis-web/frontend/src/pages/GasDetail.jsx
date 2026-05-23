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
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="flex items-center gap-4 px-6 py-4 bg-gray-900 border-b border-gray-800">
        <Link to="/" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
        <h1 className="text-xl font-bold">{meta.label} Detail</h1>
        <span className="text-gray-500 text-sm">{meta.chip} · {meta.unit}</span>
        <button onClick={() => setShowExport(true)}
          className="ml-auto px-4 py-1.5 text-sm bg-gray-800 border border-gray-600 rounded-lg hover:bg-gray-700">
          Export CSV
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Time range */}
        <div className="flex gap-1">
          {TIME_RANGES.map((r) => (
            <button key={r} onClick={() => setTimeRange(r)}
              className={`px-3 py-1 text-xs rounded ${timeRange === r ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {r}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          {/* WHO/EPA threshold lines are visual guides */}
          <TrendChart history={history} gasKey={gasKey} timeRange={timeRange} />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Min', value: fmt(gasStats?.min, 2) },
            { label: 'Max', value: fmt(gasStats?.max, 2) },
            { label: 'Avg', value: fmt(gasStats?.avg, 2) },
            { label: 'Current', value: history.length ? fmt(history[history.length - 1]?.[gasKey], 2) : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-2xl font-mono font-bold mt-1">{value}</p>
              <p className="text-xs text-gray-600">{meta.unit}</p>
            </div>
          ))}
        </div>

        {/* Health + WHO info */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">About {meta.label}</h3>
            <p className="text-sm text-gray-400">{meta.description}</p>
            <h4 className="text-sm font-semibold text-gray-300 mt-3 mb-1">Health Impact</h4>
            <p className="text-sm text-gray-400">{meta.healthImpact}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">WHO Guideline Comparison</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Your {timeRange} avg</span>
                <span className="font-mono text-white">{fmt(avgVal, 2)} {meta.unit}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">WHO guideline</span>
                <span className="font-mono text-green-400">{meta.whoGuideline} {meta.unit}</span>
              </div>
              {whoComparison && (
                <div className="mt-2 p-2 rounded bg-gray-800 text-center">
                  <span className={`font-bold text-lg ${parseInt(whoComparison) > 100 ? 'text-red-400' : 'text-green-400'}`}>
                    {whoComparison}%
                  </span>
                  <span className="text-gray-400 text-xs ml-1">of WHO guideline</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alert history */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Alert History for {meta.label}</h3>
          {!alerts.length ? (
            <p className="text-sm text-gray-500">No alerts in this period.</p>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 10).map((a) => (
                <div key={a.id} className="flex items-center gap-3 text-xs border-b border-gray-800 pb-2">
                  <span className={`px-2 py-0.5 rounded font-bold ${a.level === 'CRITICAL' ? 'bg-red-900/50 text-red-400' : 'bg-orange-900/50 text-orange-400'}`}>
                    {a.level}
                  </span>
                  <span className="text-gray-400">{new Date(a.ts).toLocaleString()}</span>
                  <span className="text-white">Value: {a.value?.toFixed(2)}</span>
                  <span className="text-gray-500">Threshold: {a.threshold?.toFixed(2)}</span>
                  <span className={`ml-auto ${a.acknowledged ? 'text-gray-600' : 'text-yellow-500'}`}>
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
