import { buildCSV } from '../../src/services/export.service.js';

const columns = [
  {
    header: 'ID',
    key: 'id',
  },
  {
    header: 'Title',
    key: 'title',
  },
  {
    header: 'Status',
    key: 'status',
  },
];

describe('CSV export service', () => {
  test('returns a Buffer', () => {
    const result = buildCSV({
      columns,
      rows: [],
    });

    expect(Buffer.isBuffer(result)).toBe(true);
  });

  test('includes column headers', () => {
    const result = buildCSV({
      columns,
      rows: [],
    }).toString('utf8');

    expect(result).toBe('ID,Title,Status\r\n');
  });

  test('exports expected rows', () => {
    const result = buildCSV({
      columns,
      rows: [
        {
          id: 1,
          title: 'Setup database',
          status: 'in_progress',
        },
        {
          id: 2,
          title: 'Write API docs',
          status: 'pending',
        },
      ],
    }).toString('utf8');

    expect(result).toBe(
      [
        'ID,Title,Status',
        '1,Setup database,in_progress',
        '2,Write API docs,pending',
        '',
      ].join('\r\n'),
    );
  });

  test('escapes commas, quotes, and line breaks', () => {
    const result = buildCSV({
      columns,
      rows: [
        {
          id: 1,
          title: 'Review "API, docs"\nToday',
          status: 'pending',
        },
      ],
    }).toString('utf8');

    expect(result).toContain('1,"Review ""API, docs""\nToday",pending');
  });

  test('converts null and undefined values to empty strings', () => {
    const result = buildCSV({
      columns,
      rows: [
        {
          id: 1,
          title: null,
          status: undefined,
        },
      ],
    }).toString('utf8');

    expect(result).toContain('1,,');
  });

  test('serializes object values as JSON', () => {
    const result = buildCSV({
      columns: [
        {
          header: 'ID',
          key: 'id',
        },
        {
          header: 'Metadata',
          key: 'metadata',
        },
      ],
      rows: [
        {
          id: 1,
          metadata: {
            priority: 'high',
          },
        },
      ],
    }).toString('utf8');

    expect(result).toContain('1,"{""priority"":""high""}"');
  });

  test('neutralizes spreadsheet formulas', () => {
    const result = buildCSV({
      columns,
      rows: [
        {
          id: 1,
          title: '=SUM(1,2)',
          status: '@dangerous',
        },
      ],
    }).toString('utf8');

    expect(result).toContain('1,"\'=SUM(1,2)",\'@dangerous');
  });

  test('rejects missing columns', () => {
    expect(() =>
      buildCSV({
        columns: [],
        rows: [],
      }),
    ).toThrow(TypeError);
  });

  test('rejects non-array rows', () => {
    expect(() =>
      buildCSV({
        columns,
        rows: null,
      }),
    ).toThrow(TypeError);
  });
});
