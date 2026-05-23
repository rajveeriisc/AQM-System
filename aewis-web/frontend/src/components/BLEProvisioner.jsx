import { useState, useEffect, useRef } from 'react';
import client from '../api/client';
import { getSocket } from '../hooks/useSocket';

const SERVICE_UUID     = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHAR_DEVICE_ID   = '4fafc202-1fb5-459e-8fcc-c5c9c331914b';
const CHAR_SSID        = '4fafc203-1fb5-459e-8fcc-c5c9c331914b';
const CHAR_PASSWORD    = '4fafc204-1fb5-459e-8fcc-c5c9c331914b';
const CHAR_STATUS      = '4fafc205-1fb5-459e-8fcc-c5c9c331914b';
const CHAR_BACKEND_URL = '4fafc206-1fb5-459e-8fcc-c5c9c331914b';
const CHAR_WIFI_SCAN   = '4fafc207-1fb5-459e-8fcc-c5c9c331914b';

const STEPS = ['detect', 'scan', 'wifi', 'sending', 'waiting', 'claim'];

export default function BLEProvisioner({ open, onClose, onComplete }) {
  const [step, setStep] = useState('detect');
  const [bleAvailable, setBleAvailable] = useState(false);
  const [error, setError] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [backendUrl, setBackendUrl] = useState('');
  const [claimName, setClaimName] = useState('');
  const [manualId, setManualId] = useState('');
  const [wifiNetworks, setWifiNetworks] = useState([]);

  const bleDeviceRef = useRef(null);
  const serviceRef   = useRef(null);
  const waitTimerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStep('detect');
    setError('');
    setDeviceId('');
    setDeviceName('');
    setSsid('');
    setPassword('');
    setBackendUrl('');
    setClaimName('');
    setManualId('');
    setWifiNetworks([]);
    bleDeviceRef.current = null;
    serviceRef.current   = null;
    setBleAvailable(typeof navigator !== 'undefined' && !!navigator.bluetooth);
  }, [open]);

  // Cleanup BLE on close
  useEffect(() => {
    if (!open && bleDeviceRef.current?.gatt?.connected) {
      bleDeviceRef.current.gatt.disconnect();
    }
    if (!open) clearTimeout(waitTimerRef.current);
  }, [open]);

  // 45-second fallback: if BLE drops before "connected" notification arrives,
  // offer manual claim instead of spinning forever
  useEffect(() => {
    if (step === 'waiting') {
      waitTimerRef.current = setTimeout(() => {
        setError('No response from device after 45 s — it may have connected anyway. Enter the Device ID to continue.');
      }, 45000);
    } else {
      clearTimeout(waitTimerRef.current);
    }
    return () => clearTimeout(waitTimerRef.current);
  }, [step]);

  // Socket: watch for MQTT provision event (SoftAP path)
  useEffect(() => {
    if (step !== 'waiting' || !manualId) return;
    const sock = getSocket();
    sock.emit('provision:watch', { deviceId: manualId });
    const handler = ({ deviceId: dId }) => {
      if (dId === manualId) setStep('claim');
    };
    sock.on('device:provisioned', handler);
    return () => {
      sock.off('device:provisioned', handler);
      sock.emit('provision:unwatch', { deviceId: manualId });
    };
  }, [step, manualId]);

  async function handleScan() {
    setError('');
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'AEWIS-' }],
        optionalServices: [SERVICE_UUID],
      });
      bleDeviceRef.current = device;
      setDeviceName(device.name || '');

      const server  = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      serviceRef.current = service;

      const idChar = await service.getCharacteristic(CHAR_DEVICE_ID);
      const value  = await idChar.readValue();
      const id     = new TextDecoder().decode(value);
      setDeviceId(id);
      setClaimName(device.name || id);

      // Read WiFi scan results — device scanned nearby networks on boot
      try {
        const scanChar = await service.getCharacteristic(CHAR_WIFI_SCAN);
        const scanVal  = await scanChar.readValue();
        const networks = JSON.parse(new TextDecoder().decode(scanVal));
        if (Array.isArray(networks)) setWifiNetworks(networks);
      } catch (_) { /* older firmware without scan characteristic — ignore */ }

      setStep('wifi');
    } catch (err) {
      if (err.name !== 'NotFoundError') setError(err.message);
    }
  }

  async function handleSendWifi(e) {
    e.preventDefault();
    setError('');
    if (!ssid || ssid === '__manual__') { setError('Please select or enter a WiFi network name.'); return; }
    setStep('sending');
    try {
      const service = serviceRef.current;
      const enc     = new TextEncoder();

      const ssidChar = await service.getCharacteristic(CHAR_SSID);
      await ssidChar.writeValue(enc.encode(ssid));

      const passChar = await service.getCharacteristic(CHAR_PASSWORD);
      await passChar.writeValue(enc.encode(password));

      // Send backend URL so device knows where to register + which MQTT broker
      if (backendUrl.trim()) {
        const urlChar = await service.getCharacteristic(CHAR_BACKEND_URL);
        await urlChar.writeValue(enc.encode(backendUrl.trim()));
      }

      // Subscribe to status notifications
      const statusChar = await service.getCharacteristic(CHAR_STATUS);
      await statusChar.startNotifications();
      statusChar.addEventListener('characteristicvaluechanged', (evt) => {
        const status = new TextDecoder().decode(evt.target.value);
        if (status === 'connected') setStep('claim');
        if (status === 'failed')    setError('Device failed to connect to WiFi. Check credentials and try again.');
      });
      setStep('waiting');
    } catch (err) {
      setError(err.message);
      setStep('wifi');
    }
  }

  async function handleClaim(e) {
    e.preventDefault();
    setError('');
    const id = deviceId || manualId;
    try {
      await client.post('/devices/claim', { device_id: id, name: claimName || id });
      onComplete();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to claim device');
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md relative">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-800">
          <h2 className="text-lg font-bold">Add Device</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5">
          {/* Step: detect */}
          {step === 'detect' && (
            <div className="space-y-4">
              {bleAvailable ? (
                <>
                  <p className="text-sm text-gray-300">
                    Your browser supports Web Bluetooth. Power on your AEWIS device — it will advertise as <span className="font-mono text-blue-400">AEWIS-XXXXXX</span>.
                  </p>
                  <button onClick={() => setStep('scan')}
                    className="w-full py-2.5 bg-blue-600 rounded-lg text-sm font-medium hover:bg-blue-500">
                    Scan for Device via Bluetooth
                  </button>
                  <hr className="border-gray-700" />
                  <button onClick={() => setStep('softap')}
                    className="w-full py-2 text-xs text-gray-500 hover:text-gray-300">
                    Use manual setup instead (SoftAP)
                  </button>
                </>
              ) : (
                <SoftAPInstructions onClaim={() => setStep('softap')} />
              )}
            </div>
          )}

          {/* Step: scan */}
          {step === 'scan' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300">
                Make sure your AEWIS device is powered on and in pairing mode (LED blinks blue).
              </p>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button onClick={handleScan}
                className="w-full py-2.5 bg-blue-600 rounded-lg text-sm font-medium hover:bg-blue-500">
                Scan &amp; Connect
              </button>
              <button onClick={() => setStep('detect')}
                className="w-full py-2 text-xs text-gray-500 hover:text-gray-300">
                Back
              </button>
            </div>
          )}

          {/* Step: wifi */}
          {step === 'wifi' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <span>●</span>
                <span>Connected to <span className="font-semibold">{deviceName}</span></span>
              </div>
              <p className="text-xs text-gray-500 font-mono">Device ID: {deviceId}</p>
              <form onSubmit={handleSendWifi} className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400">
                    WiFi Network (2.4 GHz)
                    {wifiNetworks.length > 0 && (
                      <span className="ml-2 text-blue-400">{wifiNetworks.length} networks found</span>
                    )}
                  </label>
                  {wifiNetworks.length > 0 ? (
                    <select
                      value={ssid}
                      onChange={(e) => setSsid(e.target.value)}
                      className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white">
                      <option value="">— Select a network —</option>
                      {wifiNetworks.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                      <option value="__manual__">Other (type manually)</option>
                    </select>
                  ) : (
                    <input required value={ssid} onChange={(e) => setSsid(e.target.value)}
                      placeholder="Your WiFi name"
                      className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white" />
                  )}
                  {ssid === '__manual__' && (
                    <input required onChange={(e) => setSsid(e.target.value)}
                      placeholder="Type WiFi name"
                      autoFocus
                      className="w-full mt-2 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white" />
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-400">WiFi Password</label>
                  <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your WiFi password"
                    className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Backend URL <span className="text-gray-600">(e.g. http://192.168.1.100:3000)</span></label>
                  <input value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)}
                    placeholder="http://your-server-ip:3000"
                    className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono" />
                </div>
                <p className="text-xs text-yellow-600">Tip: AEWIS devices only support 2.4 GHz networks, not 5 GHz.</p>
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setStep('scan')}
                    className="flex-1 py-2 bg-gray-700 text-sm rounded">Back</button>
                  <button type="submit"
                    className="flex-1 py-2 bg-blue-600 text-sm rounded hover:bg-blue-500">Send to Device</button>
                </div>
              </form>
            </div>
          )}

          {/* Step: sending */}
          {step === 'sending' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <Spinner />
              <p className="text-sm text-gray-300">Sending WiFi credentials to device…</p>
            </div>
          )}

          {/* Step: waiting */}
          {step === 'waiting' && (
            <div className="flex flex-col items-center gap-4 py-6">
              {!error && <Spinner />}
              <p className="text-sm text-gray-300 text-center">
                Device is connecting to <span className="font-semibold">{ssid}</span>…<br />
                <span className="text-xs text-gray-500">This usually takes 10–20 seconds.</span>
              </p>
              {error && (
                <div className="w-full space-y-3">
                  <p className="text-yellow-400 text-xs text-center">{error}</p>
                  <input
                    value={deviceId || manualId}
                    onChange={(e) => setManualId(e.target.value)}
                    placeholder="aewis-a1b2c3d4e5f6"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono"
                  />
                  <button
                    disabled={!(deviceId || manualId)}
                    onClick={() => { setClaimName(deviceId || manualId); setStep('claim'); }}
                    className="w-full py-2 bg-blue-600 text-sm rounded hover:bg-blue-500 disabled:opacity-40">
                    Continue to Claim
                  </button>
                  <button onClick={() => { setError(''); setStep('wifi'); }}
                    className="w-full py-2 bg-gray-700 text-sm rounded">Try Again</button>
                </div>
              )}
            </div>
          )}

          {/* Step: claim */}
          {step === 'claim' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <span>✓</span>
                <span>Device connected to WiFi</span>
              </div>
              <form onSubmit={handleClaim} className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400">Device ID</label>
                  <input value={deviceId || manualId} readOnly
                    className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono opacity-70" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Device Name</label>
                  <input required value={claimName} onChange={(e) => setClaimName(e.target.value)}
                    placeholder="e.g. Living Room"
                    className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white" />
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={onClose}
                    className="flex-1 py-2 bg-gray-700 text-sm rounded">Cancel</button>
                  <button type="submit"
                    className="flex-1 py-2 bg-green-600 text-sm rounded hover:bg-green-500 font-medium">Add to Dashboard</button>
                </div>
              </form>
            </div>
          )}

          {/* Step: softap (manual fallback) */}
          {step === 'softap' && (
            <SoftAPInstructions
              onBack={() => setStep('detect')}
              onContinue={(id) => { setManualId(id); setClaimName(id); setStep('claim'); }}
            />
          )}
        </div>

        {/* Progress dots */}
        {['scan', 'wifi', 'sending', 'waiting', 'claim'].includes(step) && (
          <div className="flex justify-center gap-1.5 pb-4">
            {['scan', 'wifi', 'waiting', 'claim'].map((s, i) => {
              const active = ['scan', 'wifi', 'sending', 'waiting'].indexOf(step) >= i ||
                             step === 'claim';
              return (
                <span key={s} className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-blue-500' : 'bg-gray-700'}`} />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SoftAPInstructions({ onBack, onContinue }) {
  const [id, setId] = useState('');

  return (
    <div className="space-y-4">
      {onBack && (
        <p className="text-xs text-amber-400">
          Your browser doesn't support Web Bluetooth (iOS / Firefox). Use manual setup:
        </p>
      )}
      <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
        <li>Power on your AEWIS device — it shows <strong>SETUP MODE</strong> on screen</li>
        <li>Go to WiFi settings → connect to <span className="font-mono text-blue-400">AEWIS-XXXXXX</span> (password = last 6 chars of that name)</li>
        <li>A setup page opens automatically — nearby WiFi networks are listed as a dropdown. If the page doesn't open, visit <span className="font-mono text-blue-400">http://192.168.4.1</span></li>
        <li>Select your home WiFi and enter the password</li>
        <li>Wait 20–30 seconds — the device connects and appears on your dashboard</li>
        <li>Enter the Device ID shown on the setup page or the device label below:</li>
      </ol>
      <div>
        <label className="text-xs text-gray-400">Device ID</label>
        <input value={id} onChange={(e) => setId(e.target.value)}
          placeholder="aewis-a1b2c3d4e5f6"
          className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono" />
      </div>
      <div className="flex gap-3">
        {onBack && (
          <button onClick={onBack} className="flex-1 py-2 bg-gray-700 text-sm rounded">Back</button>
        )}
        <button disabled={!id.trim()} onClick={() => onContinue(id.trim())}
          className="flex-1 py-2 bg-blue-600 text-sm rounded hover:bg-blue-500 disabled:opacity-40">
          Continue
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="w-10 h-10 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
  );
}
