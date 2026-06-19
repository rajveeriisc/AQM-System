import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import useStore from '../store';
import { useSocket } from '../hooks/useSocket';
import { useDevice } from '../hooks/useDevice';
import { useAlerts } from '../hooks/useAlerts';
import GasGauge from '../components/GasGauge';
import AQIRing from '../components/AQIRing';
import TrendChart from '../components/TrendChart';
import AlertBanner from '../components/AlertBanner';
import DeviceStatus from '../components/DeviceStatus';
import { GAS_KEYS, GAS_META } from '../utils/thresholds';
import { fmt, fmtTime } from '../utils/formatters';
import client from '../api/client';

const TIME_RANGES = ['1H', '6H', '24H'];
const RANGE_HOURS = { '1H': 1, '6H': 6, '24H': 24 };

export default function Dashboard() {
  const liveReading = useStore((s) => s.liveReading);
  const readingHistory = useStore((s) => s.readingHistory);
  const devices = useStore((s) => s.devices);
  const isDevicesLoading = useStore((s) => s.isDevicesLoading);
  const selectedDeviceId = useStore((s) => s.selectedDeviceId);
  const selectDevice = useStore((s) => s.selectDevice);
  const tempUnit = useStore((s) => s.tempUnit);

  const { fetchHistory } = useDevice();
  useSocket();
  useAlerts();

  const [timeRange, setTimeRange] = useState('1H');
  const [now, setNow] = useState(new Date());

  // Stats from history
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedDeviceId) return;
    fetchHistory(selectedDeviceId, RANGE_HOURS[timeRange]);
    const from = new Date(Date.now() - RANGE_HOURS[timeRange] * 3600000).toISOString();
    client.get('/readings/stats', { params: { deviceId: selectedDeviceId, from } })
      .then(({ data }) => setStats(data))
      .catch(() => {});
  }, [timeRange, selectedDeviceId]);

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);
  const temp = liveReading?.temp;
  const displayTemp = temp != null
    ? tempUnit === 'F'
      ? `${((temp * 9) / 5 + 32).toFixed(1)}°F`
      : `${temp.toFixed(1)}°C`
    : '—';

  if (isDevicesLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
        <div className="w-10 h-10 border-4 border-gray-200 dark:border-gray-800 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin flex-shrink-0"></div>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 transition-colors duration-300">
        <div className="text-6xl drop-shadow-lg">📡</div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">No devices linked</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-xs">
          Go to <strong>Devices</strong> and add your AQM Systems monitor using the 6-digit pairing code.
        </p>
        <Link
          to="/devices"
          className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg text-sm font-semibold rounded-xl transition-all duration-300"
        >
          Add Device
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen transition-colors duration-300">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white drop-shadow-sm">AQM Systems</span>
          <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 border border-green-200 dark:border-green-700/50 px-2.5 py-0.5 rounded-full font-mono font-medium shadow-sm">LIVE</span>
        </div>

        {/* Device selector */}
        <select
          value={selectedDeviceId || ''}
          onChange={(e) => selectDevice(e.target.value)}
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all duration-300"
        >
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} {d.status === 'offline' ? '(offline)' : ''}
            </option>
          ))}
        </select>

        <span className="font-mono text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800/50 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700/50">{now.toLocaleTimeString()}</span>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Alert Banner */}
        <AlertBanner />

        {/* Hero row */}
        <div className="flex flex-wrap gap-6 items-start">
          <AQIRing aqi={liveReading?.aqi} size={160} />

          <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
            <div className="flex items-center gap-2">
              {selectedDevice && (
                <DeviceStatus status={selectedDevice.status} lastSeen={selectedDevice.lastSeen} />
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-1">
              <StatCard label="Temperature" value={displayTemp} />
              <StatCard label="Humidity" value={liveReading?.rh != null ? `${fmt(liveReading.rh, 1)}%` : '—'} />
              <StatCard 
                label="Primary Pollutant" 
                value={liveReading?.primaryPollutant && GAS_META[liveReading.primaryPollutant] ? GAS_META[liveReading.primaryPollutant].label : '—'} 
              />
              <StatCard label="Readings Today" value={stats?.count ?? '—'} />
              <StatCard label={`${timeRange} Avg AQI`} value={stats?.aqi?.avg != null ? Math.round(stats.aqi.avg) : '—'} />
              <StatCard label="Last Update" value={liveReading?.ts ? fmtTime(liveReading.ts) : '—'} />
            </div>
          </div>
        </div>

        {/* Gas gauges */}
        <section>
          <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-3">Real-Time Gas Monitor — All Channels</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {GAS_KEYS.map((key) => (
              <GasGauge
                key={key}
                gasKey={key}
                value={liveReading?.[key]}
                history={readingHistory}
              />
            ))}
          </div>
        </section>

        {/* Trend chart */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm transition-colors duration-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Trend — All Gases Normalised</h2>
            <div className="flex gap-1">
              {TIME_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${timeRange === r ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <TrendChart history={readingHistory} timeRange={timeRange} />
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-xl font-mono font-bold text-gray-900 dark:text-white mt-1 drop-shadow-sm">{value}</p>
    </div>
  );
}
