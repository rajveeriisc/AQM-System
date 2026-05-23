let io;

function init(server) {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('subscribe', ({ deviceId }) => {
      socket.join(`device:${deviceId}`);
    });

    socket.on('unsubscribe', ({ deviceId }) => {
      socket.leave(`device:${deviceId}`);
    });

    socket.on('provision:watch', ({ deviceId }) => {
      socket.join(`provision:${deviceId}`);
    });

    socket.on('provision:unwatch', ({ deviceId }) => {
      socket.leave(`provision:${deviceId}`);
    });

    socket.on('pairingcode:watch', ({ code }) => {
      socket.join(`paircode:${code}`);
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

function emitDeviceStatus(deviceId, status) {
  if (io) io.to(`device:${deviceId}`).emit('device:status', { deviceId, status });
}

function emitProvision(deviceId, payload) {
  if (io) io.to(`provision:${deviceId}`).emit('device:provisioned', { deviceId, ...payload });
}

function emitDeviceClaimed(code, deviceId) {
  if (io) io.to(`paircode:${code}`).emit('device:claimed', { deviceId });
}

module.exports = { init, getIO, emitSensorUpdate, emitDeviceStatus, emitProvision, emitDeviceClaimed };
