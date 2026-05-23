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
import { GAS_KEYS } from '../utils/thresholds';
import { fmt, fmtTime } from '../utils/formatters';
import client from '../api/client';

const TIME_RANGES = ['1H', '6H', '24H'];
const RANGE_HOURS = { '1H': 1, '6H': 6, '24H': 24 };

export default function Dashboard() {
  const liveReading = useStore((s) => s.liveReading);
  const readingHistory = useStore((s) => s.readingHistory);
  const devices = useStore((s) => s.devices);
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

  if (devices.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4 px-4">
        <div className="text-5xl">📡</div>
        <h2 className="text-xl font-bold text-white">No devices linked</h2>
        <p className="text-sm text-gray-400 text-center max-w-xs">
          Go to <strong>Devices</strong> and add your AEWIS monitor using the 6-digit pairing code.
        </p>
        <Link
          to="/devices"
          className="mt-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Add Device
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight text-white">AEWIS</span>
          <span className="text-xs bg-green-900/50 text-green-400 border border-green-700 px-2 py-0.5 rounded font-mono">LIVE</span>
        </div>

        {/* Device selector */}
        <select
          value={selectedDeviceId || ''}
          onChange={(e) => selectDevice(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
        >
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} {d.status === 'offline' ? '(offline)' : ''}
            </option>
          ))}
        </select>

        <span className="font-mono text-sm text-gray-400">{now.toLocaleTimeString()}</span>
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
              <StatCard label="Primary Pollutant" value={liveReading?.primaryPollutant?.toUpperCase() || '—'} />
              <StatCard label="Readings Today" value={stats?.count ?? '—'} />
              <StatCard label={`${timeRange} Avg AQI`} value={stats?.aqi?.avg != null ? Math.round(stats.aqi.avg) : '—'} />
              <StatCard label="Last Update" value={liveReading?.ts ? fmtTime(liveReading.ts) : '—'} />
            </div>
          </div>
        </div>

        {/* Gas gauges */}
        <section>
          <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-3">Real-Time Gas Monitor — All Channels</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-widest text-gray-500">Trend — All Gases Normalised</h2>
            <div className="flex gap-1">
              {TIME_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-3 py-1 text-xs rounded ${timeRange === r ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
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
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-mono font-bold text-white mt-0.5">{value}</p>
    </div>
  );
}
