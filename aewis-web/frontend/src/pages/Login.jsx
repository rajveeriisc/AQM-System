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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">AEWIS</h1>
          <p className="text-gray-500 text-sm mt-1">Air Quality Monitor</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Sign In</h2>

          <div>
            <label className="text-xs text-gray-400">Email</label>
            <input
              type="email" required autoFocus
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400">Password</label>
            <input
              type="password" required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center text-xs text-gray-500">
            No account?{' '}
            <Link to="/register" className="text-blue-400 hover:underline">Register</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
