import { Router } from 'express';

import { queueNotification } from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = Router();

router.post(
  '/',
  authenticate,
  authorizeRoles('admin', 'manager'),
  queueNotification,
);

export default router;
