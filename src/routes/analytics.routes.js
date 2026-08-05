import { Router } from 'express';

import {
  getDashboardAnalytics,
  getTaskSummary,
  getTeamHighlights,
  getTeamProductivity,
  getTeamReport,
  getUpcomingDeadlines,
} from '../controllers/analytics.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = Router();

router.use(authenticate);

router.get(
  '/dashboard',
  authorizeRoles('admin', 'manager', 'team_member'),
  getDashboardAnalytics,
);

router.get(
  '/tasks/summary',
  authorizeRoles('admin', 'manager', 'team_member'),
  getTaskSummary,
);

router.get(
  '/teams/summary',
  authorizeRoles('admin', 'manager'),
  getTeamHighlights,
);

router.get(
  '/teams/:teamId/productivity',
  authorizeRoles('admin', 'manager'),
  getTeamProductivity,
);

router.get(
  '/teams/:teamId/report',
  authorizeRoles('admin', 'manager'),
  getTeamReport,
);

router.get(
  '/deadlines/upcoming',
  authorizeRoles('admin', 'manager', 'team_member'),
  getUpcomingDeadlines,
);

export default router;
