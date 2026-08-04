import { Router } from 'express';

import { getExportOptions } from '../controllers/exportOptions.controller.js';
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

router.get(
  '/options',
  authorizeRoles('admin', 'manager', 'team_member'),
  getExportOptions,
);

router.post(
  '/tasks',
  authorizeRoles('admin', 'manager', 'team_member'),
  exportTasks,
);

router.get(
  '/tasks/:format',
  authorizeRoles('admin', 'manager', 'team_member'),
  exportTasks,
);

router.use(authorizeRoles('admin', 'manager'));

router.get('/analytics/summary/:format', exportTaskSummary);
router.get('/deadlines/:format', exportUpcomingDeadlines);
router.get('/team-report/:format', exportTeamReport);

export default router;
