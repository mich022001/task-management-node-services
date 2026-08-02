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

  const allowedTeamIds = new Set(teamIds.map(Number));

  return tasks.filter((task) => allowedTeamIds.has(Number(task.team_id)));
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
  };
}

export function buildTeamProductivity(team, tasks, { now = new Date() } = {}) {
  const teamId = Number(team.id);

  const teamTasks = tasks.filter((task) => Number(task.team_id) === teamId);

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
      (task) => Number(task.assigned_to) === Number(member.id),
    );

    const memberCompletedTasks = memberTasks.filter(
      (task) => task.status === 'completed',
    ).length;

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
