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
    <div className="min-h-screen transition-colors duration-300">
      <header className="flex items-center gap-4 px-6 py-4 bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 transition-colors duration-300">
        <Link to="/" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white text-sm transition-colors">← Dashboard</Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white drop-shadow-sm">Settings</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Account */}
        <Section title="Account">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
              <span className="font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs">Name</span>
              <span className="font-medium text-gray-900 dark:text-white">{user?.name}</span>
            </div>
            <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
              <span className="font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs">Email</span>
              <span className="font-medium text-gray-900 dark:text-white">{user?.email}</span>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Change Password</p>
            <form onSubmit={handlePasswordChange} className="space-y-3">
              <input type="password" placeholder="Current password" value={pwForm.current}
                onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all" />
              <input type="password" placeholder="New password" value={pwForm.next}
                onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all" />
              <input type="password" placeholder="Confirm new password" value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all" />
              {pwError && <p className="text-red-500 dark:text-red-400 text-xs font-medium px-1">{pwError}</p>}
              {pwSuccess && <p className="text-green-600 dark:text-green-400 text-xs font-medium px-1">Password changed successfully.</p>}
              <button type="submit" className="mt-2 px-5 py-2.5 bg-blue-600 text-white font-medium text-sm rounded-xl hover:bg-blue-700 shadow-sm transition-colors">
                Change Password
              </button>
            </form>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
            <button onClick={handleLogout} className="px-5 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white font-medium text-sm rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              Sign Out
            </button>
          </div>
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Theme</p>
              <div className="flex gap-2">
                {['dark', 'light'].map((t) => (
                  <button key={t} onClick={() => setTheme(t)}
                    className={`px-5 py-2 text-sm font-medium rounded-xl capitalize transition-colors ${theme === t ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-5 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Temperature Unit</p>
              <div className="flex gap-2">
                {['C', 'F'].map((u) => (
                  <button key={u} onClick={() => setTempUnit(u)}
                    className={`px-5 py-2 text-sm font-medium rounded-xl transition-colors ${tempUnit === u ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                    °{u}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* About */}
        <Section title="About">
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2 bg-gray-50 dark:bg-gray-800/30 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
            <p className="font-medium text-gray-900 dark:text-gray-300">AQM Systems Dashboard <span className="font-mono text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded ml-2">v1.0.0</span></p>
            <p>Real-time air quality monitoring system</p>
            <p className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700/50">
              <a href="mailto:support@aqmsystems.in" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors">Contact Support &rarr;</a>
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm transition-colors duration-300">
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-gray-300 mb-5">{title}</h2>
      {children}
    </div>
  );
}
