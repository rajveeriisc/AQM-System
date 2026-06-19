import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDevice } from '../hooks/useDevice';
import { useSocket } from '../hooks/useSocket';
import PairingModal from '../components/PairingModal';
import DeviceStatus from '../components/DeviceStatus';
import { aqiColor, aqiLabel } from '../utils/thresholds';
import client from '../api/client';

export default function Devices() {
  const { devices, fetchDevices } = useDevice();
  useSocket(); // enables real-time device:status updates on this page
  const [showPairing, setShowPairing] = useState(false);
  const [editDevice, setEditDevice] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [delConfirm, setDelConfirm] = useState(null);

  async function handleSaveEdit(e) {
    e.preventDefault();
    try {
      await client.patch(`/devices/${editDevice.id}`, editForm);
      setEditDevice(null);
      fetchDevices();
    } catch (err) { console.error(err); }
  }

  async function handleDelete(id) {
    try {
      await client.delete(`/devices/${id}`);
      setDelConfirm(null);
      fetchDevices();
    } catch (err) { console.error(err); }
  }

  return (
    <div className="min-h-screen transition-colors duration-300">
      <header className="flex items-center gap-4 px-6 py-4 bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 transition-colors duration-300">
        <Link to="/" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white text-sm transition-colors">← Dashboard</Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white drop-shadow-sm">Devices</h1>
        <button onClick={() => setShowPairing(true)}
          className="ml-auto px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg rounded-xl transition-all duration-300">
          + Add Device
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {devices.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">No devices yet.</p>
            <button onClick={() => setShowPairing(true)}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-sm">
              Add your first device
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map((d) => {
              const aqi = d.latestReading?.aqi;
              return (
                <div key={d.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-4 shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-bold text-gray-900 dark:text-white">{d.name}</h2>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">{d.location || 'No location'}</p>
                    </div>
                    <DeviceStatus status={d.status} lastSeen={d.lastSeen} />
                  </div>

                  {aqi != null && (
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/30 p-2 rounded-xl border border-gray-100 dark:border-gray-800">
                      <span className="text-2xl font-mono font-bold" style={{ color: aqiColor(aqi) }}>{aqi}</span>
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: aqiColor(aqi) }}>{aqiLabel(aqi)}</span>
                    </div>
                  )}

                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 bg-gray-50 dark:bg-gray-800/30 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                    <p className="flex justify-between"><span>Type:</span> <span className="font-medium text-gray-900 dark:text-gray-300">{d.type || 'AQM-S3'}</span></p>
                    <p className="flex justify-between"><span>FW:</span> <span className="font-medium text-gray-900 dark:text-gray-300">{d.firmwareVersion || '—'}</span></p>
                    <p className="flex justify-between"><span>ID:</span> <span className="font-mono text-gray-900 dark:text-gray-300">{d.id}</span></p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button onClick={() => { setEditDevice(d); setEditForm({ name: d.name, location: d.location || '' }); }}
                      className="flex-1 py-2 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Edit</button>
                    <button onClick={() => setDelConfirm(d.id)}
                      className="px-4 py-2 text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PairingModal
        open={showPairing}
        onClose={() => setShowPairing(false)}
        onComplete={() => { setShowPairing(false); fetchDevices(); }}
      />

      {/* Edit modal */}
      {editDevice && (
        <div className="fixed inset-0 bg-gray-900/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl transition-colors duration-300">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5 drop-shadow-sm">Edit {editDevice.name}</h2>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Name</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full mt-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Location</label>
                <input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="w-full mt-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all" />
              </div>
              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => setEditDevice(null)}
                  className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                <button type="submit"
                  className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 shadow-sm transition-colors">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delConfirm && (
        <div className="fixed inset-0 bg-gray-900/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900/50 rounded-2xl p-6 w-full max-w-sm text-center shadow-xl transition-colors duration-300">
            <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">Delete Device?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">This will permanently delete the device and all its readings and alerts.</p>
            <div className="flex gap-3">
              <button onClick={() => setDelConfirm(null)} className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium text-sm rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(delConfirm)} className="flex-1 py-2.5 bg-red-600 text-white font-medium text-sm rounded-xl hover:bg-red-700 shadow-sm transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


