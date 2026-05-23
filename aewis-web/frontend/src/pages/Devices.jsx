import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useDevice } from '../hooks/useDevice';
import DeviceStatus from '../components/DeviceStatus';
import { aqiColor, aqiLabel } from '../utils/thresholds';
import client from '../api/client';
import { getSocket } from '../hooks/useSocket';

export default function Devices() {
  const { devices, fetchDevices } = useDevice();
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
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="flex items-center gap-4 px-6 py-4 bg-gray-900 border-b border-gray-800">
        <Link to="/" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
        <h1 className="text-xl font-bold">Devices</h1>
        <button onClick={() => setShowPairing(true)}
          className="ml-auto px-4 py-1.5 text-sm bg-blue-600 rounded hover:bg-blue-500">
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
                <div key={d.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-semibold text-white">{d.name}</h2>
                      <p className="text-xs text-gray-500">{d.location || 'No location'}</p>
                    </div>
                    <DeviceStatus status={d.status} lastSeen={d.lastSeen} />
                  </div>

                  {aqi != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-mono font-bold" style={{ color: aqiColor(aqi) }}>{aqi}</span>
                      <span className="text-xs" style={{ color: aqiColor(aqi) }}>{aqiLabel(aqi)}</span>
                    </div>
                  )}

                  <div className="text-xs text-gray-500 space-y-0.5">
                    <p>Type: {d.type || 'AQM-S3'}</p>
                    <p>FW: {d.firmwareVersion || '—'}</p>
                    <p>ID: <span className="font-mono text-gray-600">{d.id}</span></p>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setEditDevice(d); setEditForm({ name: d.name, location: d.location || '' }); }}
                      className="flex-1 py-1.5 text-xs bg-gray-800 rounded hover:bg-gray-700">Edit</button>
                    <button onClick={() => setDelConfirm(d.id)}
                      className="px-3 py-1.5 text-xs bg-red-900/40 text-red-400 rounded hover:bg-red-900/60">Delete</button>
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">Edit {editDevice.name}</h2>
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400">Name</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Location</label>
                <input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditDevice(null)}
                  className="flex-1 py-2 bg-gray-700 text-sm rounded">Cancel</button>
                <button type="submit"
                  className="flex-1 py-2 bg-blue-600 text-sm rounded hover:bg-blue-500">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-red-900 rounded-xl p-6 w-full max-w-sm text-center">
            <h2 className="text-lg font-bold text-red-400 mb-2">Delete Device?</h2>
            <p className="text-sm text-gray-400 mb-4">This will permanently delete the device and all its readings and alerts.</p>
            <div className="flex gap-3">
              <button onClick={() => setDelConfirm(null)} className="flex-1 py-2 bg-gray-700 text-sm rounded">Cancel</button>
              <button onClick={() => handleDelete(delConfirm)} className="flex-1 py-2 bg-red-700 text-sm rounded hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAIRING MODAL  — AP + Captive Portal + 6-digit code
//  Works on iOS, Android, Windows, Mac — no BLE, no app required
// ─────────────────────────────────────────────────────────────────────────────
function PairingModal({ open, onClose, onComplete }) {
  const [step, setStep] = useState('loading');   // loading | waiting | done | expired | error
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [timeLeft, setTimeLeft] = useState(600);
  const [claimedId, setClaimedId] = useState('');
  const pollRef = useRef(null);

  // Generate pairing code when modal opens
  useEffect(() => {
    if (!open) return;
    setStep('loading');
    setCode('');
    setClaimedId('');
    setTimeLeft(600);

    client.post('/devices/pairing-code')
      .then(({ data }) => {
        setCode(data.code);
        setExpiresAt(new Date(data.expires_at));
        setStep('waiting');
      })
      .catch(() => setStep('error'));
  }, [open]);

  // Countdown timer
  useEffect(() => {
    if (step !== 'waiting' || !expiresAt) return;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) { clearInterval(tick); setStep('expired'); }
    }, 1000);
    return () => clearInterval(tick);
  }, [step, expiresAt]);

  // Socket.io — instant notification when device claims itself
  useEffect(() => {
    if (step !== 'waiting' || !code) return;
    const sock = getSocket();
    sock.emit('pairingcode:watch', { code });

    const onClaimed = ({ deviceId }) => {
      setClaimedId(deviceId);
      setStep('done');
    };
    sock.on('device:claimed', onClaimed);

    // Fallback HTTP poll every 4s in case Socket.io misses the event
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await client.get(`/devices/pairing-code/${code}/status`);
        if (data.status === 'claimed') { setClaimedId(data.device_id); setStep('done'); }
        if (data.status === 'expired') setStep('expired');
      } catch (_) {}
    }, 4000);

    return () => {
      sock.off('device:claimed', onClaimed);
      sock.emit('pairingcode:unwatch', { code });
      clearInterval(pollRef.current);
    };
  }, [step, code]);

  // Clean up on close
  useEffect(() => {
    if (!open) clearInterval(pollRef.current);
  }, [open]);

  if (!open) return null;

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-800">
          <h2 className="text-lg font-bold">Add Device</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-6">

          {/* Loading */}
          {step === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Spinner />
              <p className="text-sm text-gray-400">Generating pairing code…</p>
            </div>
          )}

          {/* Waiting for device */}
          {step === 'waiting' && (
            <div className="space-y-5">
              {/* Instructions */}
              <ol className="space-y-2 text-sm text-gray-300">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                  <span>Power on your AEWIS device — screen shows <strong>SETUP MODE</strong></span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                  <span>Go to WiFi settings → connect to <span className="font-mono text-blue-400">AEWIS-XXXXXX</span><br/>
                    <span className="text-xs text-gray-500">Password = last 6 chars of network name</span>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                  <span>Setup page opens automatically — enter this code:</span>
                </li>
              </ol>

              {/* 6-digit code */}
              <div className="flex justify-center gap-2">
                {code.split('').map((digit, i) => (
                  <div key={i}
                    className="w-12 h-14 bg-gray-800 border border-gray-600 rounded-lg flex items-center justify-center text-2xl font-mono font-bold text-white">
                    {digit}
                  </div>
                ))}
              </div>

              {/* Timer */}
              <div className="text-center text-xs text-gray-500">
                Code expires in <span className="font-mono text-gray-300">{mins}:{secs}</span>
              </div>

              <div className="flex items-center gap-3 py-3 px-4 bg-gray-800/50 rounded-lg">
                <Spinner small />
                <p className="text-sm text-gray-400">Waiting for device to connect…</p>
              </div>

              <p className="text-xs text-gray-600 text-center">
                If the page doesn't open automatically, visit{' '}
                <span className="font-mono text-gray-400">http://192.168.4.1</span>
              </p>
            </div>
          )}

          {/* Success */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-14 h-14 rounded-full bg-green-600/20 border border-green-600 flex items-center justify-center text-3xl">
                ✓
              </div>
              <div>
                <p className="text-lg font-semibold text-green-400">Device Connected!</p>
                <p className="text-xs text-gray-500 mt-1 font-mono">{claimedId}</p>
              </div>
              <p className="text-sm text-gray-400">Your device is now linked to your account and sending data.</p>
              <button onClick={onComplete}
                className="w-full py-2.5 bg-green-600 rounded-lg text-sm font-medium hover:bg-green-500">
                Go to Dashboard
              </button>
            </div>
          )}

          {/* Expired */}
          {step === 'expired' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <p className="text-amber-400 font-semibold">Code expired</p>
              <p className="text-sm text-gray-400">The 10-minute window passed. Generate a new code and try again.</p>
              <button onClick={() => {
                setStep('loading');
                client.post('/devices/pairing-code').then(({ data }) => {
                  setCode(data.code); setExpiresAt(new Date(data.expires_at));
                  setTimeLeft(600); setStep('waiting');
                }).catch(() => setStep('error'));
              }} className="w-full py-2.5 bg-blue-600 rounded-lg text-sm hover:bg-blue-500">
                Generate New Code
              </button>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <p className="text-red-400 font-semibold">Something went wrong</p>
              <p className="text-sm text-gray-400">Could not generate a pairing code. Make sure the backend is running.</p>
              <button onClick={onClose} className="w-full py-2 bg-gray-700 rounded-lg text-sm">Close</button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function Spinner({ small = false }) {
  const size = small ? 'w-4 h-4 border-2' : 'w-8 h-8 border-4';
  return <div className={`${size} border-gray-600 border-t-blue-500 rounded-full animate-spin flex-shrink-0`} />;
}
