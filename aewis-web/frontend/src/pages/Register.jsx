import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import useStore from '../store';

export default function Register() {
  const navigate = useNavigate();
  const setAuth = useStore((s) => s.setAuth);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await client.post('/auth/register', form);
      setAuth(data.user, data.token, data.refreshToken);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
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
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create Account</h2>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Name</label>
            <input type="text" required autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full mt-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Email</label>
            <input type="email" required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full mt-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Password <span className="font-normal normal-case tracking-normal ml-1">(min 8 chars)</span></label>
            <input type="password" required minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full mt-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-all"
            />
          </div>

          {error && <p className="text-red-600 dark:text-red-400 font-medium text-xs px-1">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-md transition-all">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>

          <p className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 pt-2">
            Have an account?{' '}
            <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">Sign In</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
