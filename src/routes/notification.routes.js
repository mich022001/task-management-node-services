import { Router } from 'express';

import { queueNotification } from '../controllers/notification.controller.js';
import { authenticateNotificationCaller } from '../middleware/authenticateNotificationCaller.js';
import { notificationRateLimiter } from '../middleware/notificationRateLimiter.js';

const router = Router();

router.post(
  '/',
  authenticateNotificationCaller,
  notificationRateLimiter,
  queueNotification,
);

export default router;
