const STATUS_LABELS = Object.freeze({
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
});

const PRIORITY_LABELS = Object.freeze({
  low: 'Low',
  medium: 'Medium',
  high: 'High',
});

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function roundNumber(value, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function calculateDurationHours(startValue, endValue) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);

  if (!start || !end || end.getTime() < start.getTime()) {
    return null;
  }

  return roundNumber((end.getTime() - start.getTime()) / (60 * 60 * 1000));
}

function formatDuration(hours) {
  if (hours === null || hours === undefined) {
    return '';
  }

  if (hours < 1) {
    const minutes = Math.round(hours * 60);

    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  if (hours < 24) {
    const roundedHours = roundNumber(hours);

    return `${roundedHours} ${roundedHours === 1 ? 'hour' : 'hours'}`;
  }

  const days = roundNumber(hours / 24);

  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function getUserName(user, fallback = 'Unassigned') {
  return user?.name?.trim() || fallback;
}

function getLatestRecord(records = []) {
  return (
    [...records]
      .filter((record) => parseDate(record.created_at))
      .sort(
        (first, second) =>
          parseDate(second.created_at).getTime() -
          parseDate(first.created_at).getTime(),
      )[0] ?? null
  );
}

function normalizeStatus(value) {
  return STATUS_LABELS[value] ?? value ?? 'Unknown';
}

function normalizePriority(value) {
  return PRIORITY_LABELS[value] ?? value ?? 'Unknown';
}

function isOverdue(task, now) {
  if (
    !task.due_date ||
    task.status === 'completed' ||
    task.status === 'cancelled'
  ) {
    return false;
  }

  const dueDate = parseDate(task.due_date);

  return dueDate ? dueDate.getTime() < now.getTime() : false;
}

function getLatestStatusHistory(task) {
  return getLatestRecord(task.status_histories);
}

function getLatestActivity(task) {
  return getLatestRecord(task.activity_logs);
}

function getLastUpdateInformation(task) {
  const latestActivity = getLatestActivity(task);
  const latestStatus = getLatestStatusHistory(task);

  const activityTime = parseDate(latestActivity?.created_at)?.getTime() ?? 0;
  const statusTime = parseDate(latestStatus?.created_at)?.getTime() ?? 0;
  const taskUpdateTime = parseDate(task.updated_at)?.getTime() ?? 0;

  if (latestActivity && activityTime >= statusTime) {
    return {
      updated_at: latestActivity.created_at,
      updated_by: getUserName(latestActivity.actor, 'System'),
      update_summary:
        latestActivity.description ?? 'Task details were updated.',
    };
  }

  if (latestStatus && statusTime >= activityTime) {
    return {
      updated_at: latestStatus.created_at,
      updated_by: getUserName(latestStatus.changed_by, 'System'),
      update_summary: `Status changed from ${normalizeStatus(
        latestStatus.previous_status,
      )} to ${normalizeStatus(latestStatus.new_status)}.`,
    };
  }

  return {
    updated_at: task.updated_at ?? null,
    updated_by: getUserName(task.creator, 'System'),
    update_summary:
      taskUpdateTime > 0 ? 'Task record was updated.' : 'No updates recorded.',
  };
}

export function buildManagementTaskRows(tasks, { now = new Date() } = {}) {
  return tasks.map((task) => {
    const latestStatus = getLatestStatusHistory(task);
    const lastUpdate = getLastUpdateInformation(task);

    const completionHours =
      task.status === 'completed'
        ? calculateDurationHours(task.created_at, task.completed_at)
        : null;

    const currentAgeHours =
      task.status !== 'completed' && task.status !== 'cancelled'
        ? calculateDurationHours(task.created_at, now)
        : null;

    return {
      task_id: task.id,
      task: task.title,
      team: task.team?.name ?? 'Unknown team',
      severity: normalizePriority(task.priority),
      status: normalizeStatus(task.status),
      created_by: getUserName(task.creator, 'Unknown'),
      assigned_to: getUserName(task.assignee),
      created_at: task.created_at ?? null,
      due_date: task.due_date ?? null,
      completed_at: task.completed_at ?? null,
      time_to_complete: formatDuration(completionHours),
      completion_hours: completionHours,
      current_age: formatDuration(currentAgeHours),
      last_updated_at: lastUpdate.updated_at,
      last_updated_by: lastUpdate.updated_by,
      latest_update: lastUpdate.update_summary,
      latest_status_note: latestStatus?.note ?? '',
      overdue: isOverdue(task, now) ? 'Yes' : 'No',
    };
  });
}

export function buildManagementUpdateRows(tasks) {
  const rows = [];

  for (const task of tasks) {
    for (const activity of task.activity_logs ?? []) {
      rows.push({
        task_id: task.id,
        task: task.title,
        team: task.team?.name ?? 'Unknown team',
        happened_at: activity.created_at ?? null,
        performed_by: getUserName(activity.actor, 'System'),
        event: activity.action ?? 'task_updated',
        update: activity.description ?? '',
        previous_status:
          activity.changes?.status?.from !== undefined
            ? normalizeStatus(activity.changes.status.from)
            : '',
        new_status:
          activity.changes?.status?.to !== undefined
            ? normalizeStatus(activity.changes.status.to)
            : '',
        note: activity.changes?.note ?? '',
      });
    }

    for (const history of task.status_histories ?? []) {
      const duplicateActivity = (task.activity_logs ?? []).some(
        (activity) =>
          activity.action === 'status_changed' &&
          activity.created_at === history.created_at,
      );

      if (duplicateActivity) {
        continue;
      }

      rows.push({
        task_id: task.id,
        task: task.title,
        team: task.team?.name ?? 'Unknown team',
        happened_at: history.created_at ?? null,
        performed_by: getUserName(history.changed_by, 'System'),
        event: 'status_changed',
        update: `Status changed from ${normalizeStatus(
          history.previous_status,
        )} to ${normalizeStatus(history.new_status)}.`,
        previous_status: normalizeStatus(history.previous_status),
        new_status: normalizeStatus(history.new_status),
        note: history.note ?? '',
      });
    }
  }

  return rows.sort((first, second) => {
    const firstTime = parseDate(first.happened_at)?.getTime() ?? 0;
    const secondTime = parseDate(second.happened_at)?.getTime() ?? 0;

    return secondTime - firstTime;
  });
}

export function buildManagementSummary(tasks, taskRows) {
  const completedRows = taskRows.filter((row) => row.status === 'Completed');

  const completionHours = completedRows
    .map((row) => row.completion_hours)
    .filter((value) => typeof value === 'number');

  const averageCompletionHours =
    completionHours.length === 0
      ? 0
      : roundNumber(
          completionHours.reduce((sum, value) => sum + value, 0) /
            completionHours.length,
        );

  return {
    total_tasks: tasks.length,
    pending_tasks: taskRows.filter((row) => row.status === 'Pending').length,
    in_progress_tasks: taskRows.filter((row) => row.status === 'In Progress')
      .length,
    completed_tasks: completedRows.length,
    cancelled_tasks: taskRows.filter((row) => row.status === 'Cancelled')
      .length,
    overdue_tasks: taskRows.filter((row) => row.overdue === 'Yes').length,
    high_severity_tasks: taskRows.filter((row) => row.severity === 'High')
      .length,
    average_completion_hours: averageCompletionHours,
    average_completion_time: formatDuration(averageCompletionHours),
  };
}

export function buildManagementReport(tasks, options = {}) {
  const taskRows = buildManagementTaskRows(tasks, options);

  return {
    summary: buildManagementSummary(tasks, taskRows),
    tasks: taskRows,
    updates: buildManagementUpdateRows(tasks),
  };
}
