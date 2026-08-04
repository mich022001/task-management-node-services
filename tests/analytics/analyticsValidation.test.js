import {
  formatValidationErrors,
  taskSummaryQuerySchema,
  teamProductivityParamsSchema,
  teamReportParamsSchema,
  teamReportQuerySchema,
  upcomingDeadlinesQuerySchema,
} from '../../src/validation/analytics.schema.js';

describe('Analytics request validation', () => {
  describe('task summary query', () => {
    test('accepts an empty query', () => {
      const result = taskSummaryQuerySchema.safeParse({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    test('accepts and converts a valid team ID', () => {
      const result = taskSummaryQuerySchema.safeParse({
        team_id: '11111111-1111-4111-8111-111111111111',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        team_id: '11111111-1111-4111-8111-111111111111',
      });
    });

    test('rejects a non-numeric team ID', () => {
      const result = taskSummaryQuerySchema.safeParse({
        team_id: 'invalid',
      });

      expect(result.success).toBe(false);
    });

    test('rejects a zero team ID', () => {
      const result = taskSummaryQuerySchema.safeParse({
        team_id: '0',
      });

      expect(result.success).toBe(false);
    });

    test('rejects a negative team ID', () => {
      const result = taskSummaryQuerySchema.safeParse({
        team_id: '-1',
      });

      expect(result.success).toBe(false);
    });

    test('rejects a decimal team ID', () => {
      const result = taskSummaryQuerySchema.safeParse({
        team_id: '1.5',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('team productivity parameters', () => {
    test('accepts and converts a valid team ID', () => {
      const result = teamProductivityParamsSchema.safeParse({
        teamId: '22222222-2222-4222-8222-222222222222',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        teamId: '22222222-2222-4222-8222-222222222222',
      });
    });

    test('rejects a missing team ID', () => {
      const result = teamProductivityParamsSchema.safeParse({});

      expect(result.success).toBe(false);
    });

    test('rejects an invalid team ID', () => {
      const result = teamProductivityParamsSchema.safeParse({
        teamId: 'invalid',
      });

      expect(result.success).toBe(false);
    });

    test('rejects a zero team ID', () => {
      const result = teamProductivityParamsSchema.safeParse({
        teamId: '0',
      });

      expect(result.success).toBe(false);
    });

    test('rejects a negative team ID', () => {
      const result = teamProductivityParamsSchema.safeParse({
        teamId: '-3',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('upcoming deadlines query', () => {
    test('applies the default seven-day range', () => {
      const result = upcomingDeadlinesQuerySchema.safeParse({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        days: 7,
      });
    });

    test('accepts and converts valid query values', () => {
      const result = upcomingDeadlinesQuerySchema.safeParse({
        days: '14',
        team_id: '33333333-3333-4333-8333-333333333333',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        days: 14,
        team_id: '33333333-3333-4333-8333-333333333333',
      });
    });

    test('rejects zero days', () => {
      const result = upcomingDeadlinesQuerySchema.safeParse({
        days: '0',
      });

      expect(result.success).toBe(false);
    });

    test('rejects negative days', () => {
      const result = upcomingDeadlinesQuerySchema.safeParse({
        days: '-1',
      });

      expect(result.success).toBe(false);
    });

    test('rejects days above the maximum', () => {
      const result = upcomingDeadlinesQuerySchema.safeParse({
        days: '91',
      });

      expect(result.success).toBe(false);
    });

    test('rejects decimal days', () => {
      const result = upcomingDeadlinesQuerySchema.safeParse({
        days: '7.5',
      });

      expect(result.success).toBe(false);
    });

    test('rejects non-numeric days', () => {
      const result = upcomingDeadlinesQuerySchema.safeParse({
        days: 'invalid',
      });

      expect(result.success).toBe(false);
    });

    test('rejects an invalid optional team ID', () => {
      const result = upcomingDeadlinesQuerySchema.safeParse({
        days: '7',
        team_id: 'invalid',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('team report parameters', () => {
    test('accepts a valid team UUID', () => {
      const result = teamReportParamsSchema.safeParse({
        teamId: '11111111-1111-4111-8111-111111111111',
      });

      expect(result.success).toBe(true);
    });

    test('rejects an invalid team UUID', () => {
      const result = teamReportParamsSchema.safeParse({
        teamId: 'invalid',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('team report query', () => {
    test('applies the default due-date field', () => {
      const result = teamReportQuerySchema.safeParse({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        date_field: 'due_date',
        member_ids: [],
        statuses: [],
        priorities: [],
      });
    });

    test('accepts a complete report filter set', () => {
      const result = teamReportQuerySchema.safeParse({
        date_from: '2026-08-01',
        date_to: '2026-08-31',
        date_field: 'completed_at',
        member_ids:
          '22222222-2222-4222-8222-222222222222,' +
          '33333333-3333-4333-8333-333333333333',
        statuses: 'completed,in_progress',
        priorities: 'high,medium',
      });

      expect(result.success).toBe(true);

      expect(result.data).toEqual({
        date_from: '2026-08-01',
        date_to: '2026-08-31',
        date_field: 'completed_at',
        member_ids: [
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
        ],
        statuses: ['completed', 'in_progress'],
        priorities: ['high', 'medium'],
      });
    });

    test('accepts repeated query values', () => {
      const result = teamReportQuerySchema.safeParse({
        statuses: ['pending', 'completed'],
        priorities: ['low', 'high'],
      });

      expect(result.success).toBe(true);
      expect(result.data.statuses).toEqual([
        'pending',
        'completed',
      ]);
      expect(result.data.priorities).toEqual([
        'low',
        'high',
      ]);
    });

    test('rejects an invalid calendar date', () => {
      const result = teamReportQuerySchema.safeParse({
        date_from: '2026-02-30',
      });

      expect(result.success).toBe(false);
    });

    test('rejects a reversed date range', () => {
      const result = teamReportQuerySchema.safeParse({
        date_from: '2026-08-31',
        date_to: '2026-08-01',
      });

      expect(result.success).toBe(false);

      expect(
        result.error.issues.some(
          (issue) => issue.path.join('.') === 'date_to',
        ),
      ).toBe(true);
    });

    test('rejects an invalid member UUID', () => {
      const result = teamReportQuerySchema.safeParse({
        member_ids: 'invalid',
      });

      expect(result.success).toBe(false);
    });

    test('rejects unsupported status and priority filters', () => {
      const result = teamReportQuerySchema.safeParse({
        statuses: 'archived',
        priorities: 'urgent',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('validation error formatting', () => {
    test('groups validation messages by field', () => {
      const result = upcomingDeadlinesQuerySchema.safeParse({
        days: '0',
        team_id: '-1',
      });

      expect(result.success).toBe(false);

      const errors = formatValidationErrors(result.error);

      expect(errors).toEqual({
        days: expect.any(Array),
        team_id: expect.any(Array),
      });

      expect(errors.days.length).toBeGreaterThan(0);
      expect(errors.team_id.length).toBeGreaterThan(0);
    });
  });
});
