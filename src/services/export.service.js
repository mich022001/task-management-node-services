import ExcelJS from 'exceljs';

const spreadsheetFormulaPrefixPattern = /^[=+\-@]/;

function assertColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TypeError('Export columns must be a non-empty array.');
  }

  for (const column of columns) {
    if (
      !column ||
      typeof column.header !== 'string' ||
      column.header.trim() === '' ||
      typeof column.key !== 'string' ||
      column.key.trim() === ''
    ) {
      throw new TypeError(
        'Every export column requires a non-empty header and key.',
      );
    }
  }
}

function assertRows(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError('Export rows must be an array.');
  }
}

function neutralizeSpreadsheetFormula(value) {
  if (
    typeof value === 'string' &&
    spreadsheetFormulaPrefixPattern.test(value)
  ) {
    return `'${value}`;
  }

  return value;
}

function normalizeExportValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return neutralizeSpreadsheetFormula(value);
}

function normalizeRows(columns, rows) {
  return rows.map((row) =>
    Object.fromEntries(
      columns.map((column) => [
        column.key,
        normalizeExportValue(row?.[column.key]),
      ]),
    ),
  );
}

function escapeCsvValue(value) {
  const normalizedValue = String(value);

  if (
    normalizedValue.includes(',') ||
    normalizedValue.includes('"') ||
    normalizedValue.includes('\n') ||
    normalizedValue.includes('\r')
  ) {
    return `"${normalizedValue.replaceAll('"', '""')}"`;
  }

  return normalizedValue;
}

export function buildCSV({ columns, rows }) {
  assertColumns(columns);
  assertRows(rows);

  const normalizedRows = normalizeRows(columns, rows);

  const lines = [
    columns.map((column) => escapeCsvValue(column.header)).join(','),
    ...normalizedRows.map((row) =>
      columns.map((column) => escapeCsvValue(row[column.key])).join(','),
    ),
  ];

  return Buffer.from(`${lines.join('\r\n')}\r\n`, 'utf8');
}

export function buildJSON(data) {
  if (data === undefined) {
    throw new TypeError('JSON export data cannot be undefined.');
  }

  return Buffer.from(`${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function addWorksheet(
  workbook,
  {
    worksheetName,
    columns,
    rows,
  },
) {
  assertColumns(columns);
  assertRows(rows);

  if (
    typeof worksheetName !== 'string' ||
    worksheetName.trim() === ''
  ) {
    throw new TypeError(
      'Worksheet name must be a non-empty string.',
    );
  }

  const worksheet = workbook.addWorksheet(
    worksheetName.slice(0, 31),
  );

  worksheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width:
      column.width ??
      Math.max(column.header.length + 2, 12),
  }));

  const normalizedRows = normalizeRows(columns, rows);

  worksheet.addRows(normalizedRows);

  worksheet.views = [
    {
      state: 'frozen',
      ySplit: 1,
    },
  ];

  worksheet.autoFilter = {
    from: {
      row: 1,
      column: 1,
    },
    to: {
      row: 1,
      column: columns.length,
    },
  };

  return worksheet;
}

export async function buildXLSX({
  worksheetName = 'Export',
  columns,
  rows,
  worksheets,
}) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'Task Management Node.js Services';
  workbook.created = new Date();

  if (worksheets !== undefined) {
    if (
      !Array.isArray(worksheets) ||
      worksheets.length === 0
    ) {
      throw new TypeError(
        'XLSX worksheets must be a non-empty array.',
      );
    }

    for (const worksheetDefinition of worksheets) {
      addWorksheet(workbook, worksheetDefinition);
    }
  } else {
    addWorksheet(workbook, {
      worksheetName,
      columns,
      rows,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return Buffer.from(buffer);
}
