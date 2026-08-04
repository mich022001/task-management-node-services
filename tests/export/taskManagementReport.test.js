import {
  buildManagementReport,
  buildManagementTaskRows,
  buildManagementUpdateRows,
} from '../../src/services/taskManagementReport.service.js';

function createTask(overrides = {}) {
  return {
    id: 'task-1',
    title: 'Prepare release package',
    status: 'completed',
    priority: 'high',
    created_at: '2026-08-01T08:00:00.000Z',
    updated_at: '2026-08-02T12:00:00.000Z',
    due_date: '2026-08-05T08:00:00.000Z',
    completed_at: '2026-08-02T08:00:00.000Z',
    team: {
      id: 'team-1',
      name: 'Engineering',
    },
    creator: {
      id: 'creator-1',
      name: 'Project Manager',
    },
    assignee: {
      id: 'member-1',
      name: 'Michael Developer',
    },
    status_histories: [
      {
        previous_status: 'in_progress',
        new_status: 'completed',
        note: 'Validated and delivered.',
        created_at: '2026-08-02T08:00:00.000Z',
        changed_by: {
          name: 'Michael Developer',
        },
      },
    ],
    activity_logs: [
      {
        action: 'status_changed',
        description:
          'Michael Developer changed the task status from in_progress to completed.',
        changes: {
          status: {
            from: 'in_progress',
            to: 'completed',
          },
          note: 'Validated and delivered.',
        },
        created_at: '2026-08-02T08:00:00.000Z',
        actor: {
          name: 'Michael Developer',
        },
      },
      {
        action: 'task_updated',
        description: 'Project Manager updated the task details.',
        changes: {
          priority: {
            from: 'medium',
            to: 'high',
          },
        },
        created_at: '2026-08-02T12:00:00.000Z',
        actor: {
          name: 'Project Manager',
        },
      },
    ],
    ...overrides,
  };
}

describe('Management-friendly task report', () => {
  test('creates readable task rows', () => {
    const rows = buildManagementTaskRows([createTask()], {
      now: new Date('2026-08-04T00:00:00.000Z'),
    });

    expect(rows[0]).toMatchObject({
      task: 'Prepare release package',
      team: 'Engineering',
      severity: 'High',
      status: 'Completed',
      created_by: 'Project Manager',
      assigned_to: 'Michael Developer',
      time_to_complete: '1 day',
      completion_hours: 24,
      last_updated_by: 'Project Manager',
      latest_update: 'Project Manager updated the task details.',
      latest_status_note: 'Validated and delivered.',
      overdue: 'No',
    });
  });

  test('creates newest-first update history', () => {
    const rows = buildManagementUpdateRows([createTask()]);

    expect(rows).toHaveLength(2);

    expect(rows[0]).toMatchObject({
      performed_by: 'Project Manager',
      event: 'task_updated',
    });

    expect(rows[1]).toMatchObject({
      performed_by: 'Michael Developer',
      event: 'status_changed',
      previous_status: 'In Progress',
      new_status: 'Completed',
    });
  });

  test('creates concise management summary', () => {
    const report = buildManagementReport(
      [
        createTask(),
        createTask({
          id: 'task-2',
          status: 'in_progress',
          completed_at: null,
          due_date: '2026-08-03T08:00:00.000Z',
        }),
      ],
      {
        now: new Date('2026-08-04T00:00:00.000Z'),
      },
    );

    expect(report.summary).toEqual({
      total_tasks: 2,
      pending_tasks: 0,
      in_progress_tasks: 1,
      completed_tasks: 1,
      cancelled_tasks: 0,
      overdue_tasks: 1,
      high_severity_tasks: 2,
      average_completion_hours: 24,
      average_completion_time: '1 day',
    });
  });
});
