import { useState, useEffect, useRef } from 'react';
import client from '../api/client';
import { getSocket } from '../hooks/useSocket';

export default function PairingModal({ open, onClose, onComplete }) {
  const [step, setStep] = useState('loading');
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
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add Device</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 dark:hover:text-white text-xl leading-none transition-colors">×</button>
        </div>

        <div className="px-6 py-6">

          {/* Loading */}
          {step === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Spinner />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Generating pairing code…</p>
            </div>
          )}

          {/* Waiting for device */}
          {step === 'waiting' && (
            <div className="space-y-6">
              {/* Instructions */}
              <ol className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-600 dark:text-white text-xs flex items-center justify-center font-bold">1</span>
                  <span className="mt-0.5">Power on your AQM Systems monitor. Wait for the screen to show <strong className="text-gray-900 dark:text-white">SETUP MODE</strong></span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-600 dark:text-white text-xs flex items-center justify-center font-bold">2</span>
                  <span className="mt-0.5">Go to your phone's WiFi settings and connect to <span className="font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">AQM-XXXXXX</span><br/>
                    <span className="text-xs text-gray-500 mt-1 block">Password = last 6 characters of the network name</span>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-600 dark:text-white text-xs flex items-center justify-center font-bold">3</span>
                  <span className="mt-0.5">The setup page will open. Enter this code:</span>
                </li>
              </ol>

              {/* 6-digit code */}
              <div className="flex justify-center gap-2 px-2">
                {code.split('').map((digit, i) => (
                  <div key={i}
                    className="w-12 h-14 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center text-2xl font-mono font-bold text-blue-600 dark:text-blue-400 shadow-sm">
                    {digit}
                  </div>
                ))}
              </div>

              {/* Timer */}
              <div className="text-center text-xs font-medium text-gray-500 dark:text-gray-500">
                Code expires in <span className="font-mono text-gray-900 dark:text-gray-300">{mins}:{secs}</span>
              </div>

              <div className="flex items-center justify-center gap-3 py-3 px-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800/50">
                <Spinner small />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Waiting for device to connect…</p>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-600 text-center">
                If the page doesn't open automatically, visit{' '}
                <span className="font-mono text-gray-700 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">http://192.168.4.1</span>
              </p>
            </div>
          )}

          {/* Success */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-5 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-600/20 border-2 border-green-500 flex items-center justify-center text-3xl text-green-600 dark:text-green-400 shadow-lg shadow-green-500/20">
                ✓
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">Device Connected!</p>
                <p className="text-sm text-gray-500 mt-1 font-mono">{claimedId}</p>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Your AQM Systems monitor is now successfully linked to your account.</p>
              <button onClick={onComplete}
                className="w-full mt-2 py-3 bg-green-600 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg hover:bg-green-500 transition-all">
                Go to Dashboard
              </button>
            </div>
          )}

          {/* Expired */}
          {step === 'expired' && (
            <div className="flex flex-col items-center gap-5 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-600/20 border-2 border-amber-500 flex items-center justify-center text-3xl text-amber-600 dark:text-amber-400">
                !
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">Code Expired</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">The 10-minute setup window has closed.</p>
              </div>
              <button onClick={() => {
                setStep('loading');
                client.post('/devices/pairing-code').then(({ data }) => {
                  setCode(data.code); setExpiresAt(new Date(data.expires_at));
                  setTimeLeft(600); setStep('waiting');
                }).catch(() => setStep('error'));
              }} className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-500 transition-all">
                Generate New Code
              </button>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-5 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-600/20 border-2 border-red-500 flex items-center justify-center text-3xl text-red-600 dark:text-red-400">
                ×
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">Connection Error</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Could not generate a pairing code. Please check your internet connection and try again.</p>
              </div>
              <button onClick={onClose} className="w-full py-3 bg-gray-800 text-white rounded-xl text-sm font-bold shadow-md hover:bg-gray-700 transition-all">
                Close
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function Spinner({ small = false }) {
  const size = small ? 'w-5 h-5 border-2' : 'w-10 h-10 border-4';
  return <div className={`${size} border-gray-200 dark:border-gray-800 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin flex-shrink-0`} />;
}
