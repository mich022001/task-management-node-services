import { getTasks } from '../clients/laravel/taskClient.js';
import { logger } from '../config/logger.js';
import { buildTaskSummary } from '../services/analytics.service.js';

async function getAllTasks(getTasksFn) {
  const tasks = [];
  let currentPage = 1;
  let lastPage = 1;

  do {
    const response = await getTasksFn({
      page: currentPage,
      per_page: 100,
    });

    tasks.push(...(response.data ?? []));

    lastPage = response.meta?.last_page ?? currentPage;
    currentPage += 1;
  } while (currentPage <= lastPage);

  return tasks;
}

export async function runDailyDigest({
  getTasksFn = getTasks,
  buildTaskSummaryFn = buildTaskSummary,
  loggerInstance = logger,
  now = new Date(),
} = {}) {
  const tasks = await getAllTasks(getTasksFn);

  const summary = buildTaskSummaryFn(tasks, {
    now,
  });

  const result = {
    generated_at: now.toISOString(),
    total_tasks: summary.total_tasks,
    pending_tasks: summary.status.pending,
    in_progress_tasks: summary.status.in_progress,
    completed_tasks: summary.status.completed,
    cancelled_tasks: summary.status.cancelled,
    overdue_tasks: summary.overdue_tasks,
    completion_rate: summary.completion_rate,
    priority: summary.priority,
  };

  loggerInstance.info(
    {
      digest: result,
    },
    'Daily task digest generated.',
  );

  return result;
}
