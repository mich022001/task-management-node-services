import { Router } from 'express';

import {
  exportTasks,
  exportTaskSummary,
  exportTeamReport,
  exportUpcomingDeadlines,
} from '../controllers/export.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = Router();

router.use(authenticate);
router.use(authorizeRoles('admin', 'manager'));

router.get('/tasks/:format', exportTasks);
router.get('/analytics/summary/:format', exportTaskSummary);
router.get('/deadlines/:format', exportUpcomingDeadlines);
router.get('/team-report/:format', exportTeamReport);

export default router;
