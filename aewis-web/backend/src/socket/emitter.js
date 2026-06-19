let io;

function init(server) {
  const { Server } = require('socket.io');
  const { createAdapter } = require('@socket.io/redis-adapter');
  const Redis = require('ioredis');

  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  if (process.env.REDIS_URL) {
    const pubClient = new Redis(process.env.REDIS_URL);
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    console.log('Socket.io using Redis adapter');
  }

  const jwt = require('jsonwebtoken');
  const { query } = require('../services/db');

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error: Token missing'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = payload;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('subscribe', async ({ deviceId }) => {
      try {
        const { rows } = await query(
          'SELECT 1 FROM user_devices WHERE user_id = $1 AND device_id = $2',
          [socket.user.userId, deviceId]
        );
        if (rows.length > 0) {
          socket.join(`device:${deviceId}`);
        }
      } catch (err) {
        console.error('Socket subscribe error:', err.message);
      }
    });

    socket.on('unsubscribe', ({ deviceId }) => {
      socket.leave(`device:${deviceId}`);
    });

    socket.on('pairingcode:watch', async ({ code }) => {
      try {
        const { rows } = await query(
          'SELECT 1 FROM pairing_codes WHERE code = $1 AND user_id = $2',
          [code, socket.user.userId]
        );
        if (rows.length > 0) {
          socket.join(`paircode:${code}`);
        }
      } catch (err) {
        console.error('Socket pairingcode watch error:', err.message);
      }
    });

    socket.on('pairingcode:unwatch', ({ code }) => {
      socket.leave(`paircode:${code}`);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
    });
  });

  return io;
}

function getIO() {
  return io;
}

function emitSensorUpdate(deviceId, reading) {
  if (io) io.to(`device:${deviceId}`).emit('sensor:update', reading);
}

function emitDeviceStatus(deviceId, status, lastSeen = null) {
  if (io) io.to(`device:${deviceId}`).emit('device:status', { deviceId, status, lastSeen });
}

function emitProvision(deviceId, payload) {
  if (io) io.to(`provision:${deviceId}`).emit('device:provisioned', { deviceId, ...payload });
}

function emitDeviceClaimed(code, deviceId) {
  if (io) io.to(`paircode:${code}`).emit('device:claimed', { deviceId });
}

module.exports = { init, getIO, emitSensorUpdate, emitDeviceStatus, emitProvision, emitDeviceClaimed };
