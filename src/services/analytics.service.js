const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];

const TASK_PRIORITIES = ['low', 'medium', 'high'];

function createZeroCounts(values) {
  return Object.fromEntries(values.map((value) => [value, 0]));
}

function calculatePercentage(value, total) {
  if (total === 0) {
    return 0;
  }

  return Number(((value / total) * 100).toFixed(2));
}

function calculateAverage(values) {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return Number((total / values.length).toFixed(2));
}

function getCompletionDurationDays(task) {
  if (task.status !== 'completed' || !task.created_at || !task.completed_at) {
    return null;
  }

  const createdAt = new Date(task.created_at);
  const completedAt = new Date(task.completed_at);

  const createdTime = createdAt.getTime();
  const completedTime = completedAt.getTime();

  if (
    Number.isNaN(createdTime) ||
    Number.isNaN(completedTime) ||
    completedTime < createdTime
  ) {
    return null;
  }

  return (completedTime - createdTime) / (24 * 60 * 60 * 1000);
}

function buildCompletionMetrics(tasks) {
  const completionDurations = [];
  const durationsByPriority = Object.fromEntries(
    TASK_PRIORITIES.map((priority) => [priority, []]),
  );

  for (const task of tasks) {
    const durationDays = getCompletionDurationDays(task);

    if (durationDays === null) {
      continue;
    }

    completionDurations.push(durationDays);

    if (Object.hasOwn(durationsByPriority, task.priority)) {
      durationsByPriority[task.priority].push(durationDays);
    }
  }

  return {
    average_completion_days: calculateAverage(completionDurations),

    average_completion_days_by_priority: Object.fromEntries(
      TASK_PRIORITIES.map((priority) => [
        priority,
        calculateAverage(durationsByPriority[priority]),
      ]),
    ),
  };
}

function isTaskOverdue(task, currentTime) {
  if (!task.due_date) {
    return false;
  }

  if (task.status === 'completed' || task.status === 'cancelled') {
    return false;
  }

  const dueDate = new Date(task.due_date);

  if (Number.isNaN(dueDate.getTime())) {
    return false;
  }

  return dueDate.getTime() < currentTime.getTime();
}

function filterTasksByTeamIds(tasks, teamIds) {
  if (teamIds === undefined) {
    return tasks;
  }

  const allowedTeamIds = new Set(teamIds.map(String));

  return tasks.filter((task) => allowedTeamIds.has(String(task.team_id)));
}

export function buildTaskSummary(tasks, { teamIds, now = new Date() } = {}) {
  const filteredTasks = filterTasksByTeamIds(tasks, teamIds);

  const status = createZeroCounts(TASK_STATUSES);
  const priority = createZeroCounts(TASK_PRIORITIES);

  let completedTasks = 0;
  let overdueTasks = 0;

  for (const task of filteredTasks) {
    if (Object.hasOwn(status, task.status)) {
      status[task.status] += 1;
    }

    if (Object.hasOwn(priority, task.priority)) {
      priority[task.priority] += 1;
    }

    if (task.status === 'completed') {
      completedTasks += 1;
    }

    if (isTaskOverdue(task, now)) {
      overdueTasks += 1;
    }
  }

  const totalTasks = filteredTasks.length;

  return {
    total_tasks: totalTasks,
    status,
    priority,
    completed_tasks: completedTasks,
    overdue_tasks: overdueTasks,
    completion_rate: calculatePercentage(completedTasks, totalTasks),
    ...buildCompletionMetrics(filteredTasks),
  };
}

export function buildTeamProductivity(team, tasks, { now = new Date() } = {}) {
  const teamId = String(team.id);

  const teamTasks = tasks.filter((task) => String(task.team_id) === teamId);

  const status = createZeroCounts(TASK_STATUSES);

  let completedTasks = 0;
  let overdueTasks = 0;

  for (const task of teamTasks) {
    if (Object.hasOwn(status, task.status)) {
      status[task.status] += 1;
    }

    if (task.status === 'completed') {
      completedTasks += 1;
    }

    if (isTaskOverdue(task, now)) {
      overdueTasks += 1;
    }
  }

  const totalTasks = teamTasks.length;

  const members = (team.members ?? []).map((member) => {
    const memberTasks = teamTasks.filter(
      (task) => String(task.assigned_to) === String(member.id),
    );

    const memberCompletedTasks = memberTasks.filter(
      (task) => task.status === 'completed',
    ).length;

    const memberPriority = createZeroCounts(TASK_PRIORITIES);

    for (const task of memberTasks) {
      if (Object.hasOwn(memberPriority, task.priority)) {
        memberPriority[task.priority] += 1;
      }
    }

    return {
      user_id: member.id,
      name: member.name,
      email: member.email,
      member_role: member.member_role ?? null,
      assigned_tasks: memberTasks.length,
      completed_tasks: memberCompletedTasks,
      completion_rate: calculatePercentage(
        memberCompletedTasks,
        memberTasks.length,
      ),
      priority: memberPriority,
      ...buildCompletionMetrics(memberTasks),
    };
  });

  return {
    team: {
      id: team.id,
      name: team.name,
    },

    summary: {
      total_tasks: totalTasks,
      pending_tasks: status.pending,
      in_progress_tasks: status.in_progress,
      completed_tasks: status.completed,
      cancelled_tasks: status.cancelled,
      overdue_tasks: overdueTasks,
      completion_rate: calculatePercentage(completedTasks, totalTasks),
      ...buildCompletionMetrics(teamTasks),
    },

    members,
  };
}

function serializeDeadlineTask(task) {
  return {
    id: task.id,
    title: task.title,
    team_id: task.team_id,
    assigned_to: task.assigned_to ?? null,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date,
  };
}

export function buildUpcomingDeadlines(
  tasks,
  { days = 7, teamIds, now = new Date() } = {},
) {
  const currentTime = now.getTime();
  const rangeEndTime = currentTime + days * 24 * 60 * 60 * 1000;

  const filteredTasks = filterTasksByTeamIds(tasks, teamIds);

  const overdue = [];
  const upcoming = [];

  for (const task of filteredTasks) {
    if (
      task.status === 'completed' ||
      task.status === 'cancelled' ||
      !task.due_date
    ) {
      continue;
    }

    const dueDate = new Date(task.due_date);
    const dueTime = dueDate.getTime();

    if (Number.isNaN(dueTime)) {
      continue;
    }

    const deadlineTask = serializeDeadlineTask(task);

    if (dueTime < currentTime) {
      overdue.push(deadlineTask);

      continue;
    }

    if (dueTime <= rangeEndTime) {
      upcoming.push(deadlineTask);
    }
  }

  overdue.sort(
    (firstTask, secondTask) =>
      new Date(firstTask.due_date).getTime() -
      new Date(secondTask.due_date).getTime(),
  );

  upcoming.sort(
    (firstTask, secondTask) =>
      new Date(firstTask.due_date).getTime() -
      new Date(secondTask.due_date).getTime(),
  );

  return {
    range_days: days,
    overdue,
    upcoming,
  };
}

const REPORT_DATE_FIELDS = new Set(['created_at', 'due_date', 'completed_at']);

function parseUtcDateBoundary(value, { exclusiveEnd = false } = {}) {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, yearValue, monthValue, dayValue] = match;

  const year = Number(yearValue);
  const monthIndex = Number(monthValue) - 1;
  const day = Number(dayValue);

  const parsedDate = new Date(Date.UTC(year, monthIndex, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== monthIndex ||
    parsedDate.getUTCDate() !== day
  ) {
    return null;
  }

  if (exclusiveEnd) {
    parsedDate.setUTCDate(parsedDate.getUTCDate() + 1);
  }

  return parsedDate.getTime();
}

function filterTasksForReport(
  tasks,
  {
    dateField = 'due_date',
    dateFrom,
    dateTo,
    memberIds,
    statuses,
    priorities,
  } = {},
) {
  const selectedDateField = REPORT_DATE_FIELDS.has(dateField)
    ? dateField
    : 'due_date';

  const fromTime = parseUtcDateBoundary(dateFrom);

  const toExclusiveTime = parseUtcDateBoundary(dateTo, {
    exclusiveEnd: true,
  });

  const memberIdSet =
    memberIds?.length > 0 ? new Set(memberIds.map(String)) : null;

  const statusSet = statuses?.length > 0 ? new Set(statuses) : null;

  const prioritySet = priorities?.length > 0 ? new Set(priorities) : null;

  return tasks.filter((task) => {
    if (memberIdSet && !memberIdSet.has(String(task.assigned_to))) {
      return false;
    }

    if (statusSet && !statusSet.has(task.status)) {
      return false;
    }

    if (prioritySet && !prioritySet.has(task.priority)) {
      return false;
    }

    if (fromTime === null && toExclusiveTime === null) {
      return true;
    }

    const taskDateValue = task[selectedDateField];

    if (!taskDateValue) {
      return false;
    }

    const taskTime = new Date(taskDateValue).getTime();

    if (Number.isNaN(taskTime)) {
      return false;
    }

    if (fromTime !== null && taskTime < fromTime) {
      return false;
    }

    if (toExclusiveTime !== null && taskTime >= toExclusiveTime) {
      return false;
    }

    return true;
  });
}

function serializeReportTask(task, now) {
  const completionDays = getCompletionDurationDays(task);

  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    created_at: task.created_at ?? null,
    due_date: task.due_date ?? null,
    completed_at: task.completed_at ?? null,
    completion_days:
      completionDays === null ? null : Number(completionDays.toFixed(2)),
    is_overdue: isTaskOverdue(task, now),
  };
}

function buildReportSummary(tasks, now) {
  const status = createZeroCounts(TASK_STATUSES);
  const priority = createZeroCounts(TASK_PRIORITIES);

  let overdueTasks = 0;

  for (const task of tasks) {
    if (Object.hasOwn(status, task.status)) {
      status[task.status] += 1;
    }

    if (Object.hasOwn(priority, task.priority)) {
      priority[task.priority] += 1;
    }

    if (isTaskOverdue(task, now)) {
      overdueTasks += 1;
    }
  }

  const completedTasks = status.completed;
  const unfinishedTasks = status.pending + status.in_progress;
  const cancelledTasks = status.cancelled;

  return {
    total_tasks: tasks.length,

    status: {
      pending: status.pending,
      yet_to_start: status.pending,
      in_progress: status.in_progress,
      completed: status.completed,
      cancelled: status.cancelled,
    },

    priority,

    pending_tasks: status.pending,
    yet_to_start_tasks: status.pending,
    in_progress_tasks: status.in_progress,
    completed_tasks: completedTasks,
    unfinished_tasks: unfinishedTasks,
    cancelled_tasks: cancelledTasks,
    overdue_tasks: overdueTasks,

    completion_rate: calculatePercentage(completedTasks, tasks.length),

    ...buildCompletionMetrics(tasks),
  };
}

export function buildTeamReport(
  team,
  tasks,
  {
    dateField = 'due_date',
    dateFrom,
    dateTo,
    memberIds,
    statuses,
    priorities,
    now = new Date(),
  } = {},
) {
  const teamId = String(team.id);

  const teamTasks = tasks.filter((task) => String(task.team_id) === teamId);

  const filteredTasks = filterTasksForReport(teamTasks, {
    dateField,
    dateFrom,
    dateTo,
    memberIds,
    statuses,
    priorities,
  });

  const selectedMemberIds =
    memberIds?.length > 0 ? new Set(memberIds.map(String)) : null;

  const members = (team.members ?? [])
    .filter(
      (member) =>
        !selectedMemberIds || selectedMemberIds.has(String(member.id)),
    )
    .map((member) => {
      const memberTasks = filteredTasks.filter(
        (task) => String(task.assigned_to) === String(member.id),
      );

      return {
        user_id: member.id,
        name: member.name,
        email: member.email,
        member_role: member.member_role ?? null,

        summary: {
          assigned_tasks: memberTasks.length,
          ...buildReportSummary(memberTasks, now),
        },

        tasks: memberTasks.map((task) => serializeReportTask(task, now)),
      };
    });

  const unassignedTasks = filteredTasks.filter(
    (task) => task.assigned_to === null || task.assigned_to === undefined,
  );

  return {
    team: {
      id: team.id,
      name: team.name,
    },

    filters: {
      date_from: dateFrom ?? null,
      date_to: dateTo ?? null,
      date_field: dateField,
      member_ids: memberIds ?? [],
      statuses: statuses ?? [],
      priorities: priorities ?? [],
    },

    summary: buildReportSummary(filteredTasks, now),

    deadlines: buildUpcomingDeadlines(filteredTasks, {
      days: 7,
      now,
    }),

    members,

    unassigned_tasks: unassignedTasks.map((task) =>
      serializeReportTask(task, now),
    ),
  };
}

export function buildTeamHighlights(teams, tasks, { now = new Date() } = {}) {
  const knownTeamIds = new Set(teams.map((team) => String(team.id)));

  const tasksByTeam = new Map(teams.map((team) => [String(team.id), []]));

  for (const task of tasks) {
    const teamId = String(task.team_id);

    if (!knownTeamIds.has(teamId)) {
      continue;
    }

    tasksByTeam.get(teamId).push(task);
  }

  const teamSummaries = teams.map((team) => {
    const teamTasks = tasksByTeam.get(String(team.id)) ?? [];

    const status = {
      yet_to_start: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };

    const priority = createZeroCounts(TASK_PRIORITIES);

    const highPriority = {
      yet_to_start: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
      overdue: 0,
    };

    let overdueTasks = 0;

    for (const task of teamTasks) {
      if (task.status === 'pending') {
        status.yet_to_start += 1;
      } else if (task.status === 'in_progress') {
        status.in_progress += 1;
      } else if (task.status === 'completed') {
        status.completed += 1;
      } else if (task.status === 'cancelled') {
        status.cancelled += 1;
      }

      if (Object.hasOwn(priority, task.priority)) {
        priority[task.priority] += 1;
      }

      const overdue = isTaskOverdue(task, now);

      if (overdue) {
        overdueTasks += 1;
      }

      if (task.priority === 'high') {
        if (task.status === 'pending') {
          highPriority.yet_to_start += 1;
        } else if (task.status === 'in_progress') {
          highPriority.in_progress += 1;
        } else if (task.status === 'completed') {
          highPriority.completed += 1;
        } else if (task.status === 'cancelled') {
          highPriority.cancelled += 1;
        }

        if (overdue) {
          highPriority.overdue += 1;
        }
      }
    }

    const totalTasks = teamTasks.length;

    return {
      team_id: team.id,
      team_name: team.name,

      member_count: team.members?.length ?? team.members_count ?? 0,

      total_tasks: totalTasks,

      status,

      overdue_tasks: overdueTasks,

      priority,

      high_priority: highPriority,

      completion_rate: calculatePercentage(status.completed, totalTasks),

      ...buildCompletionMetrics(teamTasks),
    };
  });

  return {
    teams: teamSummaries,
    totals: {
      teams: teamSummaries.length,
      members: teamSummaries.reduce(
        (total, team) => total + team.member_count,
        0,
      ),
      tasks: teamSummaries.reduce((total, team) => total + team.total_tasks, 0),
      overdue: teamSummaries.reduce(
        (total, team) => total + team.overdue_tasks,
        0,
      ),
      high_priority: teamSummaries.reduce(
        (total, team) => total + team.priority.high,
        0,
      ),
      high_priority_overdue: teamSummaries.reduce(
        (total, team) => total + team.high_priority.overdue,
        0,
      ),
    },
  };
}
