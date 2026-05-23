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
          a.download = `aewis-${deviceId}.csv`;
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold text-white mb-4">Export Data</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">Format</label>
            <select
              value={form.format}
              onChange={(e) => setForm({ ...form, format: e.target.value })}
              className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            >
              <option value="csv">CSV</option>
              <option value="pdf">PDF Report</option>
            </select>
          </div>

          {form.format === 'csv' && (
            <div>
              <label className="text-xs text-gray-400">Interval</label>
              <select
                value={form.interval}
                onChange={(e) => setForm({ ...form, interval: e.target.value })}
                className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
              >
                <option value="raw">Raw</option>
                <option value="1min">1 Minute</option>
                <option value="5min">5 Minutes</option>
                <option value="1hour">1 Hour</option>
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400">From</label>
            <input type="datetime-local" value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
              className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">To</label>
            <input type="datetime-local" value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              className="w-full mt-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}

        {jobId && (
          <div className="mt-3 p-3 bg-blue-900/40 border border-blue-700 rounded text-sm text-blue-300">
            Export queued (large dataset). Job ID: {jobId}
            <button onClick={handleDownload} className="ml-2 underline">Download when ready</button>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2 rounded bg-gray-700 text-gray-300 text-sm hover:bg-gray-600">
            Cancel
          </button>
          <button onClick={handleExport} disabled={loading}
            className="flex-1 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-500 disabled:opacity-50">
            {loading ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
