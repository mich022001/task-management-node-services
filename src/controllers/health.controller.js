import { env } from '../config/env.js';

export function getHealthStatus(_req, res) {
  return res.status(200).json({
    message: 'Task Management Node.js Services',
    status: 'ok',
    environment: env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    uptime: Number(process.uptime().toFixed(2)),
    timestamp: new Date().toISOString(),
  });
}
