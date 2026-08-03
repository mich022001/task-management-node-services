import {
  analyticsSummaryExportQuerySchema,
  deadlineExportQuerySchema,
  exportFormatSchema,
  formatExportValidationErrors,
  taskExportQuerySchema,
} from '../../src/validation/export.schema.js';

describe('Export request validation', () => {
  describe('export format', () => {
    test.each(['csv', 'json', 'xlsx'])('accepts the %s format', (format) => {
      const result = exportFormatSchema.safeParse({
        format,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        format,
      });
    });

    test('rejects an unsupported format', () => {
      const result = exportFormatSchema.safeParse({
        format: 'pdf',
      });

      expect(result.success).toBe(false);
    });

    test('rejects a missing format', () => {
      const result = exportFormatSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe('task export query', () => {
    test('accepts an empty query', () => {
      const result = taskExportQuerySchema.safeParse({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    test('accepts and converts a valid team ID', () => {
      const result = taskExportQuerySchema.safeParse({
        team_id: '11111111-1111-4111-8111-111111111111',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        team_id: '11111111-1111-4111-8111-111111111111',
      });
    });

    test.each([
      ['non-numeric', 'invalid'],
      ['zero', '0'],
      ['negative', '-1'],
      ['decimal', '1.5'],
    ])('rejects a %s team ID', (_description, teamId) => {
      const result = taskExportQuerySchema.safeParse({
        team_id: teamId,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('analytics summary export query', () => {
    test('accepts an optional team filter', () => {
      const result = analyticsSummaryExportQuerySchema.safeParse({
        team_id: '22222222-2222-4222-8222-222222222222',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        team_id: '22222222-2222-4222-8222-222222222222',
      });
    });

    test('rejects an invalid team filter', () => {
      const result = analyticsSummaryExportQuerySchema.safeParse({
        team_id: 'not-a-team',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('deadline export query', () => {
    test('applies the default seven-day range', () => {
      const result = deadlineExportQuerySchema.safeParse({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        days: 7,
      });
    });

    test('accepts and converts valid filters', () => {
      const result = deadlineExportQuerySchema.safeParse({
        team_id: '33333333-3333-4333-8333-333333333333',
        days: '30',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        team_id: '33333333-3333-4333-8333-333333333333',
        days: 30,
      });
    });

    test.each([
      ['zero', '0'],
      ['negative', '-1'],
      ['above maximum', '91'],
      ['decimal', '4.5'],
      ['non-numeric', 'invalid'],
    ])('rejects %s days', (_description, days) => {
      const result = deadlineExportQuerySchema.safeParse({
        days,
      });

      expect(result.success).toBe(false);
    });

    test('rejects an invalid optional team ID', () => {
      const result = deadlineExportQuerySchema.safeParse({
        team_id: 'invalid',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('validation error formatting', () => {
    test('groups validation messages by field', () => {
      const result = deadlineExportQuerySchema.safeParse({
        team_id: 'invalid',
        days: '0',
      });

      expect(result.success).toBe(false);

      const errors = formatExportValidationErrors(result.error);

      expect(errors).toEqual({
        team_id: expect.any(Array),
        days: expect.any(Array),
      });

      expect(errors.team_id.length).toBeGreaterThan(0);
      expect(errors.days.length).toBeGreaterThan(0);
    });
  });
});
