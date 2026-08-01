export function getHealthStatus(req, res) {
  return res.status(200).json({
    message: 'Task Management Node.js Services',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
}
