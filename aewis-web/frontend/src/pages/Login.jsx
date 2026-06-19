import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import useStore from '../store';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await client.post('/auth/login', form);
      setAuth(data.user, data.token, data.refreshToken);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4 transition-colors duration-300">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight drop-shadow-sm">AQM Systems</h1>
          <p className="text-gray-500 font-medium text-sm mt-2 uppercase tracking-widest">Precision Environmental Intelligence</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-8 space-y-5 shadow-xl transition-colors duration-300">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Sign In</h2>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Email</label>
            <input
              type="email" required autoFocus
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full mt-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Password</label>
            <input
              type="password" required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full mt-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all"
            />
          </div>

          {error && <p className="text-red-600 dark:text-red-400 font-medium text-xs px-1">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-md transition-all">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 pt-2">
            No account?{' '}
            <Link to="/register" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">Register</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
