import { ipKeyGenerator, MemoryStore, rateLimit } from 'express-rate-limit';

function callerKey(req) {
  if (req.notificationCaller?.type === 'service') {
    return `service:${req.notificationCaller.id}`;
  }

  if (req.notificationCaller?.id) {
    return `user:${req.notificationCaller.id}`;
  }

  return `ip:${ipKeyGenerator(req.ip)}`;
}

export const notificationRateLimitStore = new MemoryStore();

export const notificationRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: callerKey,
  store: notificationRateLimitStore,

  handler: (_req, res) => {
    return res.status(429).json({
      message: 'Too many notification requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  },
});
