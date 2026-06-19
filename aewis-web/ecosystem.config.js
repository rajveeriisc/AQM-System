module.exports = {
  apps: [
    {
      name: 'aqm-api',
      script: './backend/src/server.js',
      env: { NODE_ENV: 'production', PORT: 3000 },
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '500M',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      watch: false,
      autorestart: true,
      restart_delay: 3000,
    },
  ],
};
