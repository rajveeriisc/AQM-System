require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const { initSchema, query } = require('./services/db');
const { init: initSocket, emitDeviceStatus } = require('./socket/emitter');
const { start: startMqtt } = require('./mqtt/subscriber');
const { apiLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const readingRoutes = require('./routes/readings');
const alertRoutes = require('./routes/alerts');
const exportRoutes = require('./routes/export');

const app = express();
const server = http.createServer(app);

// Trust proxy for rate limiter behind Railway/Nginx
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(compression());
// Allow multiple origins: FRONTEND_URL can be comma-separated list
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin (origin undefined) and listed origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/readings', readingRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/export', exportRoutes);

// Health check
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = parseInt(process.env.PORT || '3000');

async function start() {
  try {
    await initSchema();
    initSocket(server);
    startMqtt();

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`AEWIS API running on port ${PORT}`);
    });

    // Mark devices offline if no reading received in 45 s
    setInterval(async () => {
      try {
        const { rows } = await query(
          `UPDATE devices SET status = 'offline'
           WHERE status = 'online' AND last_seen < NOW() - INTERVAL '45 seconds'
           RETURNING id, last_seen`
        );
        for (const d of rows) {
          emitDeviceStatus(d.id, 'offline', d.last_seen);
          console.log(`[watchdog] ${d.id} → offline`);
        }
      } catch (err) {
        console.error('[watchdog]', err.message);
      }
    }, 30_000);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

module.exports = { app, server };
