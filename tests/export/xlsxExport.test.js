import ExcelJS from 'exceljs';

import { buildXLSX } from '../../src/services/export.service.js';

const columns = [
  {
    header: 'ID',
    key: 'id',
    width: 10,
  },
  {
    header: 'Title',
    key: 'title',
    width: 30,
  },
  {
    header: 'Status',
    key: 'status',
    width: 20,
  },
];

async function loadWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(buffer);

  return workbook;
}

describe('XLSX export service', () => {
  test('returns a Buffer', async () => {
    const result = await buildXLSX({
      worksheetName: 'Tasks',
      columns,
      rows: [],
    });

    expect(Buffer.isBuffer(result)).toBe(true);
  });

  test('creates the expected worksheet', async () => {
    const buffer = await buildXLSX({
      worksheetName: 'Tasks',
      columns,
      rows: [],
    });

    const workbook = await loadWorkbook(buffer);

    expect(workbook.getWorksheet('Tasks')).toBeDefined();
  });

  test('adds column headers', async () => {
    const buffer = await buildXLSX({
      worksheetName: 'Tasks',
      columns,
      rows: [],
    });

    const workbook = await loadWorkbook(buffer);
    const worksheet = workbook.getWorksheet('Tasks');

    expect(worksheet.getRow(1).values).toEqual([
      undefined,
      'ID',
      'Title',
      'Status',
    ]);
  });

  test('exports expected rows', async () => {
    const buffer = await buildXLSX({
      worksheetName: 'Tasks',
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
    });

    const workbook = await loadWorkbook(buffer);
    const worksheet = workbook.getWorksheet('Tasks');

    expect(worksheet.rowCount).toBe(3);

    expect(worksheet.getRow(2).values).toEqual([
      undefined,
      1,
      'Setup database',
      'in_progress',
    ]);

    expect(worksheet.getRow(3).values).toEqual([
      undefined,
      2,
      'Write API docs',
      'pending',
    ]);
  });

  test('neutralizes spreadsheet formulas', async () => {
    const buffer = await buildXLSX({
      worksheetName: 'Tasks',
      columns,
      rows: [
        {
          id: 1,
          title: '=SUM(1,2)',
          status: '+dangerous',
        },
      ],
    });

    const workbook = await loadWorkbook(buffer);
    const worksheet = workbook.getWorksheet('Tasks');

    expect(worksheet.getCell('B2').value).toBe("'=SUM(1,2)");
    expect(worksheet.getCell('C2').value).toBe("'+dangerous");
  });

  test('freezes the header row', async () => {
    const buffer = await buildXLSX({
      worksheetName: 'Tasks',
      columns,
      rows: [],
    });

    const workbook = await loadWorkbook(buffer);
    const worksheet = workbook.getWorksheet('Tasks');

    expect(worksheet.views).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          state: 'frozen',
          ySplit: 1,
        }),
      ]),
    );
  });

  test('truncates worksheet names to the Excel limit', async () => {
    const longWorksheetName =
      'This worksheet name is longer than thirty-one characters';

    const buffer = await buildXLSX({
      worksheetName: longWorksheetName,
      columns,
      rows: [],
    });

    const workbook = await loadWorkbook(buffer);

    expect(workbook.worksheets[0].name.length).toBeLessThanOrEqual(31);
  });

  test('rejects missing columns', async () => {
    await expect(
      buildXLSX({
        worksheetName: 'Tasks',
        columns: [],
        rows: [],
      }),
    ).rejects.toThrow(TypeError);
  });

  test('rejects an empty worksheet name', async () => {
    await expect(
      buildXLSX({
        worksheetName: '',
        columns,
        rows: [],
      }),
    ).rejects.toThrow(TypeError);
  });
});
