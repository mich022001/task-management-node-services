import { buildJSON } from '../../src/services/export.service.js';

describe('JSON export service', () => {
  test('returns a Buffer', () => {
    const result = buildJSON({
      data: [],
    });

    expect(Buffer.isBuffer(result)).toBe(true);
  });

  test('generates valid JSON', () => {
    const result = buildJSON({
      message: 'Tasks exported successfully.',
      data: [
        {
          id: 1,
          title: 'Setup database',
        },
      ],
    });

    expect(JSON.parse(result.toString('utf8'))).toEqual({
      message: 'Tasks exported successfully.',
      data: [
        {
          id: 1,
          title: 'Setup database',
        },
      ],
    });
  });

  test('preserves nested structures', () => {
    const payload = {
      data: {
        summary: {
          total_tasks: 4,
          completed_tasks: 1,
        },
        members: [
          {
            user_id: 3,
            assigned_tasks: 4,
          },
        ],
      },
    };

    const result = buildJSON(payload);

    expect(JSON.parse(result.toString('utf8'))).toEqual(payload);
  });

  test('produces readable formatted JSON', () => {
    const result = buildJSON({
      id: 1,
      title: 'Test',
    }).toString('utf8');

    expect(result).toContain('\n  "id": 1');
    expect(result.endsWith('\n')).toBe(true);
  });

  test('rejects undefined data', () => {
    expect(() => buildJSON(undefined)).toThrow(TypeError);
  });
});
