import { Router } from 'express';

import {
  getTaskSummary,
  getTeamProductivity,
  getUpcomingDeadlines,
} from '../controllers/analytics.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = Router();

router.use(authenticate);
router.use(authorizeRoles('admin', 'manager'));

router.get('/tasks/summary', getTaskSummary);
router.get('/teams/:teamId/productivity', getTeamProductivity);
router.get('/deadlines/upcoming', getUpcomingDeadlines);

export default router;
