module.exports = {
  apps: [
    {
      name: 'aewis-api',
      script: './backend/src/server.js',
      env: { NODE_ENV: 'production', PORT: 3000 },
      // Single instance: MQTT subscriber + Socket.io must share one process.
      // With 2+ instances each process subscribes MQTT independently →
      // every reading saves twice and live updates only reach half the clients.
      // Scale horizontally only after adding Redis adapter + separate MQTT worker.
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      watch: false,
      autorestart: true,
      restart_delay: 3000,
    },
  ],
};
