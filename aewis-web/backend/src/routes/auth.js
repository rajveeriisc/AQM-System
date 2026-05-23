const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { query } = require('../services/db');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signTokens(userId, email) {
  const token = jwt.sign(
    { userId, email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '15m' }
  );
  const refreshToken = jwt.sign(
    { userId, email, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '30d' }
  );
  return { token, refreshToken };
}

// POST /api/auth/register
router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const { rows: [user] } = await query(
      'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, name, passwordHash]
    );
    const { token, refreshToken } = signTokens(user.id, user.email);
    res.status(201).json({ user, token, refreshToken });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const u = rows[0];
    const valid = await bcrypt.compare(password, u.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const { token, refreshToken } = signTokens(u.id, u.email);
    res.json({ user: { id: u.id, email: u.email, name: u.name }, token, refreshToken });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Invalid token' });
    const token = jwt.sign(
      { userId: payload.userId, email: payload.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '15m' }
    );
    res.json({ token });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => res.json({ ok: true }));

// POST /api/auth/forgotpassword
router.post('/forgotpassword', authLimiter, async (req, res) => {
  const { email } = req.body;
  // Always 200 — never leak whether the email exists
  res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });
  if (!email) return;
  try {
    const { rows } = await query('SELECT id, email, name FROM users WHERE email = $1', [email]);
    if (!rows.length) return;
    const user = rows[0];
    const resetToken = jwt.sign(
      { userId: user.id, email: user.email, type: 'reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const { sendResetEmail } = require('../services/emailService');
    await sendResetEmail(user.email, user.name, resetUrl);
  } catch (err) {
    console.error('Forgot password error:', err.message);
  }
});

// POST /api/auth/resetpassword
router.post('/resetpassword', authLimiter, async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'reset') return res.status(400).json({ error: 'Invalid reset token' });
    // Verify user still exists
    const { rows } = await query('SELECT id FROM users WHERE id = $1', [payload.userId]);
    if (!rows.length) return res.status(400).json({ error: 'User not found' });
    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, payload.userId]);
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'Invalid or expired token' });
  }
});

// POST /api/auth/changepassword  (authenticated — user knows their current password)
router.post('/changepassword', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [payload.userId]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, payload.userId]);
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

module.exports = router;
