import {
  formatValidationErrors,
  taskSummaryQuerySchema,
  teamProductivityParamsSchema,
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
        team_id: '5',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        team_id: 5,
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
        teamId: '10',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        teamId: 10,
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
        team_id: '2',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        days: 14,
        team_id: 2,
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
