import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useStore from '../store';
import client from '../api/client';

export default function Settings() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const clearAuth = useStore((s) => s.clearAuth);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const tempUnit = useStore((s) => s.tempUnit);
  const setTempUnit = useStore((s) => s.setTempUnit);

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  async function handlePasswordChange(e) {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match'); return; }
    if (pwForm.next.length < 8) { setPwError('Minimum 8 characters'); return; }
    try {
      await client.post('/auth/changepassword', {
        currentPassword: pwForm.current,
        newPassword: pwForm.next,
      });
      setPwSuccess(true);
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPwError(err.response?.data?.error || 'Failed to change password');
    }
  }

  function handleLogout() {
    clearAuth();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="flex items-center gap-4 px-6 py-4 bg-gray-900 border-b border-gray-800">
        <Link to="/" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
        <h1 className="text-xl font-bold">Settings</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Account */}
        <Section title="Account">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Name</span>
              <span className="text-white">{user?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Email</span>
              <span className="text-white">{user?.email}</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-400 mb-3">Change Password</p>
            <form onSubmit={handlePasswordChange} className="space-y-2">
              <input type="password" placeholder="Current password" value={pwForm.current}
                onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white" />
              <input type="password" placeholder="New password" value={pwForm.next}
                onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white" />
              <input type="password" placeholder="Confirm new password" value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white" />
              {pwError && <p className="text-red-400 text-xs">{pwError}</p>}
              {pwSuccess && <p className="text-green-400 text-xs">Password changed successfully.</p>}
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-500">
                Change Password
              </button>
            </form>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-800">
            <button onClick={handleLogout} className="px-4 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600">
              Sign Out
            </button>
          </div>
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-2">Theme</p>
              <div className="flex gap-2">
                {['dark', 'light'].map((t) => (
                  <button key={t} onClick={() => setTheme(t)}
                    className={`px-4 py-2 text-sm rounded capitalize ${theme === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-2">Temperature Unit</p>
              <div className="flex gap-2">
                {['C', 'F'].map((u) => (
                  <button key={u} onClick={() => setTempUnit(u)}
                    className={`px-4 py-2 text-sm rounded ${tempUnit === u ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    °{u}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* About */}
        <Section title="About">
          <div className="text-sm text-gray-400 space-y-1">
            <p>AEWIS Dashboard v1.0.0</p>
            <p>Real-time air quality monitoring system</p>
            <p className="mt-2">
              <a href="mailto:support@aewis.in" className="text-blue-400 hover:underline">Contact Support</a>
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-300 mb-4">{title}</h2>
      {children}
    </div>
  );
}
