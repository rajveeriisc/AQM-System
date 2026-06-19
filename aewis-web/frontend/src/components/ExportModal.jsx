import { useState } from 'react';
import client from '../api/client';

export default function ExportModal({ deviceId, onClose }) {
  const [form, setForm] = useState({
    from: '',
    to: '',
    interval: 'raw',
    format: 'csv',
  });
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState('');

  async function handleExport() {
    setLoading(true);
    setError('');
    try {
      if (form.format === 'csv') {
        const params = { deviceId, interval: form.interval };
        if (form.from) params.from = new Date(form.from).toISOString();
        if (form.to) params.to = new Date(form.to).toISOString();

        const res = await client.get('/export/csv', { params, responseType: 'blob' });
        if (res.status === 202) {
          const data = JSON.parse(await res.data.text());
          setJobId(data.jobId);
        } else {
          const url = URL.createObjectURL(res.data);
          const a = document.createElement('a');
          a.href = url;
          a.download = `aqm-${deviceId}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          onClose();
        }
      } else {
        const body = { deviceId };
        if (form.from) body.from = new Date(form.from).toISOString();
        if (form.to) body.to = new Date(form.to).toISOString();
        const { data } = await client.post('/export/pdf', body);
        setJobId(data.jobId);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Export failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    window.open(`/api/export/download/${jobId}`, '_blank');
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-gray-900/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-colors duration-300">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl transition-colors duration-300">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 drop-shadow-sm">Export Data</h2>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Format</label>
            <select
              value={form.format}
              onChange={(e) => setForm({ ...form, format: e.target.value })}
              className="w-full mt-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all"
            >
              <option value="csv">CSV</option>
              <option value="pdf">PDF Report</option>
            </select>
          </div>

          {form.format === 'csv' && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Interval</label>
              <select
                value={form.interval}
                onChange={(e) => setForm({ ...form, interval: e.target.value })}
                className="w-full mt-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all"
              >
                <option value="raw">Raw</option>
                <option value="1min">1 Minute</option>
                <option value="5min">5 Minutes</option>
                <option value="1hour">1 Hour</option>
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">From</label>
            <input type="datetime-local" value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
              className="w-full mt-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">To</label>
            <input type="datetime-local" value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              className="w-full mt-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all"
            />
          </div>
        </div>

        {error && <p className="text-red-600 dark:text-red-400 font-medium text-xs mt-4 px-1">{error}</p>}

        {jobId && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700/50 rounded-xl text-sm text-blue-800 dark:text-blue-300 font-medium">
            Export queued (large dataset). Job ID: <span className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">{jobId}</span>
            <button onClick={handleDownload} className="ml-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline transition-colors block mt-2">Download when ready</button>
          </div>
        )}

        <div className="flex gap-3 mt-8">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            Cancel
          </button>
          <button onClick={handleExport} disabled={loading}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-50 shadow-md transition-all">
            {loading ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
