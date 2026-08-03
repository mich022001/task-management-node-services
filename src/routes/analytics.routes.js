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

router.get(
  '/tasks/summary',
  authorizeRoles('admin', 'manager', 'team_member'),
  getTaskSummary,
);

router.get(
  '/teams/:teamId/productivity',
  authorizeRoles('admin', 'manager'),
  getTeamProductivity,
);

router.get(
  '/deadlines/upcoming',
  authorizeRoles('admin', 'manager', 'team_member'),
  getUpcomingDeadlines,
);

export default router;
