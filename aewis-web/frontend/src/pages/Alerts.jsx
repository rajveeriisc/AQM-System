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
    <div className="min-h-screen transition-colors duration-300">
      <header className="flex items-center gap-4 px-6 py-4 bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 transition-colors duration-300">
        <Link to="/" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white text-sm transition-colors">← Dashboard</Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white drop-shadow-sm">Alerts</h1>
        {tab === 'active' && activeAlerts.length > 0 && (
          <button onClick={acknowledgeAll}
            className="ml-auto px-4 py-2 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white shadow-sm hover:shadow transition-all duration-300">
            Acknowledge All
          </button>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800 pb-0">
          {['active', 'history'].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium capitalize border-b-2 transition-all duration-300 ${tab === t ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}>
              {t === 'active' ? `Active Alerts (${activeAlerts.length})` : 'Alert History'}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input placeholder="Search..."
            value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white w-40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all shadow-sm"
          />
          <select value={filters.pollutant} onChange={(e) => setFilters({ ...filters, pollutant: e.target.value })}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all shadow-sm">
            <option value="">All Pollutants</option>
            {GAS_KEYS.map((k) => <option key={k} value={k}>{GAS_META[k].label}</option>)}
          </select>
          <select value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all shadow-sm">
            <option value="">All Levels</option>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>

        {/* Alert table */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm transition-colors duration-300">
          {!filtered.length ? (
            <div className="p-12 text-center text-gray-500 bg-gray-50 dark:bg-gray-800/20 text-sm">
              {tab === 'active' ? 'No active alerts. All clear!' : 'No alert history found.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                  <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <th className="text-left py-4 px-5 font-semibold">Time</th>
                    <th className="text-left py-4 px-3 font-semibold">Pollutant</th>
                    <th className="text-right py-4 px-3 font-semibold">Value</th>
                    <th className="text-right py-4 px-3 font-semibold">Threshold</th>
                    <th className="text-left py-4 px-3 font-semibold">Level</th>
                    <th className="text-left py-4 px-3 font-semibold">Status</th>
                    {tab === 'active' && <th className="py-4 px-5"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  {filtered.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="py-3 px-5 text-gray-500 dark:text-gray-400 text-xs font-mono">{new Date(a.ts).toLocaleString()}</td>
                      <td className="py-3 px-3 font-medium text-gray-900 dark:text-white">{a.pollutant?.toUpperCase()}</td>
                      <td className="py-3 px-3 text-right font-mono text-gray-900 dark:text-white">{a.value?.toFixed(2)}</td>
                      <td className="py-3 px-3 text-right font-mono text-gray-500">{a.threshold?.toFixed(2)}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-1 text-xs rounded font-bold shadow-sm ${a.level === 'CRITICAL' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'}`}>
                          {a.level}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <span className={`font-bold tracking-wider uppercase ${a.acknowledged ? 'text-gray-400 dark:text-gray-500' : 'text-yellow-600 dark:text-yellow-500'}`}>
                          {a.acknowledged ? 'Acknowledged' : 'Active'}
                        </span>
                      </td>
                      {tab === 'active' && (
                        <td className="py-3 px-5 text-right">
                          {!a.acknowledged && (
                            <button onClick={() => acknowledge(a.id)}
                              className="text-xs px-3 py-1.5 font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white shadow-sm transition-colors">
                              Ack
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Alert rules editor */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm transition-colors duration-300">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white drop-shadow-sm">Alert Rules</h2>
            <button onClick={saveRules} disabled={rulesSaving}
              className={`px-5 py-2 text-sm font-medium rounded-xl shadow-sm transition-all duration-300 ${rulesSaved ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
              {rulesSaved ? 'Saved!' : rulesSaving ? 'Saving...' : 'Save Rules'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map((rule, i) => {
              const meta = GAS_META[rule.pollutant];
              return (
                <div key={rule.pollutant} className="bg-gray-50 dark:bg-gray-800/30 p-4 rounded-xl border border-gray-100 dark:border-gray-800 space-y-3 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-200 w-16">{meta?.label}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">{meta?.unit}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-500 block mb-1">Warn</span>
                      <input type="number" min={0} step="any"
                        value={rule.warnThreshold}
                        onChange={(e) => {
                          const r = [...rules]; r[i] = { ...r[i], warnThreshold: parseFloat(e.target.value) }; setRules(r);
                        }}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 shadow-sm transition-all"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-500 block mb-1">Crit</span>
                      <input type="number" min={0} step="any"
                        value={rule.critThreshold}
                        onChange={(e) => {
                          const r = [...rules]; r[i] = { ...r[i], critThreshold: parseFloat(e.target.value) }; setRules(r);
                        }}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 shadow-sm transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-500 block mb-1">Cooldown (Min)</span>
                    <input type="number" min={1} max={1440}
                      value={rule.cooldownMin}
                      onChange={(e) => {
                        const r = [...rules]; r[i] = { ...r[i], cooldownMin: parseInt(e.target.value) }; setRules(r);
                      }}
                      className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all"
                    />
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
