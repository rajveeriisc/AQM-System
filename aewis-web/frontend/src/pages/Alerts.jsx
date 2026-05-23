import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAlerts } from '../hooks/useAlerts';
import useStore from '../store';
import { GAS_KEYS, GAS_META } from '../utils/thresholds';
import client from '../api/client';

const DEFAULT_RULES = GAS_KEYS.map((k) => ({
  pollutant: k,
  warnThreshold: GAS_META[k].warn,
  critThreshold: GAS_META[k].crit,
  cooldownMin: 15,
}));

export default function Alerts() {
  const { activeAlerts, acknowledge, acknowledgeAll } = useAlerts();
  const selectedDeviceId = useStore((s) => s.selectedDeviceId);
  const [tab, setTab] = useState('active');
  const [history, setHistory] = useState([]);
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [filters, setFilters] = useState({ pollutant: '', level: '', search: '' });
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);

  useEffect(() => {
    client.get('/alerts', { params: { deviceId: selectedDeviceId } })
      .then(({ data }) => setHistory(data))
      .catch(console.error);
    client.get('/alerts/rules')
      .then(({ data }) => { if (data.length) setRules(data); })
      .catch(console.error);
  }, [selectedDeviceId]);

  async function saveRules() {
    setRulesSaving(true);
    try {
      await client.put('/alerts/rules', {
        rules: rules.map((r) => ({ ...r, deviceId: selectedDeviceId })),
      });
      setRulesSaved(true);
      setTimeout(() => setRulesSaved(false), 2000);
    } catch (e) { console.error(e); }
    finally { setRulesSaving(false); }
  }

  const filtered = (tab === 'active' ? activeAlerts : history).filter((a) => {
    if (filters.pollutant && a.pollutant !== filters.pollutant) return false;
    if (filters.level && a.level !== filters.level) return false;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      if (!a.pollutant?.includes(s) && !a.level?.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="flex items-center gap-4 px-6 py-4 bg-gray-900 border-b border-gray-800">
        <Link to="/" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
        <h1 className="text-xl font-bold">Alerts</h1>
        {tab === 'active' && activeAlerts.length > 0 && (
          <button onClick={acknowledgeAll}
            className="ml-auto px-3 py-1.5 text-xs bg-gray-700 border border-gray-600 rounded hover:bg-gray-600">
            Acknowledge All
          </button>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-800 pb-0">
          {['active', 'history'].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm capitalize border-b-2 ${tab === t ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>
              {t === 'active' ? `Active Alerts (${activeAlerts.length})` : 'Alert History'}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input placeholder="Search..."
            value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white w-40"
          />
          <select value={filters.pollutant} onChange={(e) => setFilters({ ...filters, pollutant: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white">
            <option value="">All Pollutants</option>
            {GAS_KEYS.map((k) => <option key={k} value={k}>{GAS_META[k].label}</option>)}
          </select>
          <select value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white">
            <option value="">All Levels</option>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>

        {/* Alert table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {!filtered.length ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              {tab === 'active' ? 'No active alerts. All clear!' : 'No alert history found.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-800">
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="text-left py-3 px-4">Time</th>
                  <th className="text-left py-3 px-2">Pollutant</th>
                  <th className="text-right py-3 px-2">Value</th>
                  <th className="text-right py-3 px-2">Threshold</th>
                  <th className="text-left py-3 px-2">Level</th>
                  <th className="text-left py-3 px-2">Status</th>
                  {tab === 'active' && <th className="py-3 px-4"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2.5 px-4 text-gray-400 text-xs">{new Date(a.ts).toLocaleString()}</td>
                    <td className="py-2.5 px-2 font-medium">{a.pollutant?.toUpperCase()}</td>
                    <td className="py-2.5 px-2 text-right font-mono">{a.value?.toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-gray-500">{a.threshold?.toFixed(2)}</td>
                    <td className="py-2.5 px-2">
                      <span className={`px-2 py-0.5 text-xs rounded font-bold ${a.level === 'CRITICAL' ? 'bg-red-900/50 text-red-400' : 'bg-orange-900/50 text-orange-400'}`}>
                        {a.level}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-xs">
                      <span className={a.acknowledged ? 'text-gray-600' : 'text-yellow-500'}>
                        {a.acknowledged ? 'Acknowledged' : 'Active'}
                      </span>
                    </td>
                    {tab === 'active' && (
                      <td className="py-2.5 px-4">
                        {!a.acknowledged && (
                          <button onClick={() => acknowledge(a.id)}
                            className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600">
                            Ack
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Alert rules editor */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300">Alert Rules</h2>
            <button onClick={saveRules} disabled={rulesSaving}
              className={`px-4 py-1.5 text-xs rounded ${rulesSaved ? 'bg-green-700 text-white' : 'bg-blue-600 text-white hover:bg-blue-500'} disabled:opacity-50`}>
              {rulesSaved ? 'Saved!' : rulesSaving ? 'Saving...' : 'Save Rules'}
            </button>
          </div>
          <div className="space-y-4">
            {rules.map((rule, i) => {
              const meta = GAS_META[rule.pollutant];
              return (
                <div key={rule.pollutant} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-300 w-16">{meta?.label}</span>
                    <span className="text-xs text-gray-500 w-12">Warn:</span>
                    <input type="number" min={0} step="any"
                      value={rule.warnThreshold}
                      onChange={(e) => {
                        const r = [...rules]; r[i] = { ...r[i], warnThreshold: parseFloat(e.target.value) }; setRules(r);
                      }}
                      className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                    />
                    <span className="text-xs text-gray-500 w-12 ml-2">Crit:</span>
                    <input type="number" min={0} step="any"
                      value={rule.critThreshold}
                      onChange={(e) => {
                        const r = [...rules]; r[i] = { ...r[i], critThreshold: parseFloat(e.target.value) }; setRules(r);
                      }}
                      className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                    />
                    <span className="text-xs text-gray-500 ml-2">Cooldown:</span>
                    <input type="number" min={1} max={1440}
                      value={rule.cooldownMin}
                      onChange={(e) => {
                        const r = [...rules]; r[i] = { ...r[i], cooldownMin: parseInt(e.target.value) }; setRules(r);
                      }}
                      className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                    />
                    <span className="text-xs text-gray-600">min</span>
                    <span className="text-xs text-gray-600 ml-2">{meta?.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
