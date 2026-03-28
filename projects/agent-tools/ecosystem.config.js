module.exports = {
  apps: [
    {
      name: 'agent-tools-api',
      script: './dist/index.js',
      instances: process.env.NODE_ENV === 'production' ? 'max' : 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        LOG_LEVEL: 'debug'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        LOG_LEVEL: 'info'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      log_type: 'json',
      // Graceful shutdown
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 5000,
      // Log rotation
      max_size: '10M',
      retain: 5,
      compress: true,
      // Health monitoring
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      // Cron restart (optional - restart daily at 3am)
      cron_restart: '0 3 * * *'
    }
  ]
};
