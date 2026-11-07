import { Buffer } from "node:buffer";
import ExcelJS from "exceljs";
import {
  IMPORT_HEADERS,
  parseImportRow,
  rawCellText,
  sanitizeCellText,
  type ImportRowError,
  type ParsedImportRow,
} from "./values";

export class ImportFileError extends Error {}

export type ParsedWorkbook = {
  rows: ParsedImportRow[];
  invalidRows: ImportRowError[];
  totalRows: number;
};

function inspectZip(buffer: Buffer): {
  encrypted: boolean;
  hasMacros: boolean;
} {
  const searchStart = Math.max(0, buffer.length - 65_557);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0)
    throw new ImportFileError("The file is not a valid .xlsx workbook.");

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (entryCount === 0xffff || centralOffset === 0xffffffff) {
    throw new ImportFileError("This workbook format is not supported.");
  }

  let offset = centralOffset;
  let encrypted = false;
  let hasMacros = false;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    ) {
      throw new ImportFileError("The file is not a valid .xlsx workbook.");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length)
      throw new ImportFileError("The file is not a valid .xlsx workbook.");
    const name = buffer.toString("utf8", nameStart, nameEnd).toLowerCase();
    encrypted ||= (flags & 1) !== 0;
    hasMacros ||=
      name.endsWith("/vbaproject.bin") || name === "xl/vbaproject.bin";
    offset = nameEnd + extraLength + commentLength;
  }
  return { encrypted, hasMacros };
}

function nonemptyRow(cells: Record<string, string>): boolean {
  return Object.values(cells).some(Boolean);
}

export async function parseXlsxWorkbook(
  buffer: Buffer,
  maxRows: number,
  maxCellChars: number,
): Promise<ParsedWorkbook> {
  const zip = inspectZip(buffer);
  if (zip.encrypted)
    throw new ImportFileError("Encrypted workbooks are not supported.");
  if (zip.hasMacros)
    throw new ImportFileError("Macro-enabled workbooks are not supported.");

  const workbook = new ExcelJS.Workbook();
  try {
    const workbookBytes = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(workbookBytes).set(buffer);
    await workbook.xlsx.load(workbookBytes);
  } catch {
    throw new ImportFileError(
      "The file could not be read as an .xlsx workbook.",
    );
  }

  const worksheet = workbook.getWorksheet("Leads") ?? workbook.worksheets[0];
  if (!worksheet)
    throw new ImportFileError("The workbook does not contain a worksheet.");

  const headerRow = worksheet.getRow(1);
  const headerColumns = new Map<number, string>();
  const foundHeaders = new Set<string>();
  for (let column = 1; column <= headerRow.cellCount; column += 1) {
    const header = sanitizeCellText(
      rawCellText(headerRow.getCell(column).value),
      maxCellChars,
    ).toLowerCase();
    if (!header || foundHeaders.has(header)) continue;
    foundHeaders.add(header);
    headerColumns.set(column, header);
  }
  if (!foundHeaders.has("domain") || !foundHeaders.has("website_url")) {
    throw new ImportFileError(
      "The header row must include domain and website_url.",
    );
  }

  const rowCells: { rowNumber: number; cells: Record<string, string> }[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: Record<string, string> = {};
    for (let column = 1; column <= row.cellCount; column += 1) {
      const value = sanitizeCellText(
        rawCellText(row.getCell(column).value),
        maxCellChars,
      );
      const header = headerColumns.get(column);
      if (header) cells[header] = value;
    }
    if (nonemptyRow(cells)) rowCells.push({ rowNumber, cells });
  });

  if (rowCells.length === 0)
    throw new ImportFileError("The workbook contains no data rows.");
  if (rowCells.length > maxRows)
    throw new ImportFileError(`The workbook exceeds the ${maxRows}-row limit.`);

  const rows: ParsedWorkbook["rows"] = [];
  const invalidRows: ImportRowError[] = [];
  for (const { rowNumber, cells } of rowCells) {
    const parsed = parseImportRow(rowNumber, cells);
    if (parsed.row) rows.push(parsed.row);
    else if (parsed.error) invalidRows.push(parsed.error);
  }
  return { rows, invalidRows, totalRows: rowCells.length };
}

export async function createImportTemplate(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Leads");
  const example = Object.fromEntries(
    IMPORT_HEADERS.map((header) => [header, ""]),
  );
  example.domain = "example.com";
  example.website_url = "https://example.com";
  example.company_name = "EXAMPLE ROW - REPLACE OR DELETE";
  example.emails = "contact@example.com";
  example.country = "US";
  example.screening_status = "UNKNOWN_REVIEW";
  for (let column = 0; column < IMPORT_HEADERS.length; column += 1) {
    worksheet.getCell(1, column + 1).value = sanitizeCellText(
      IMPORT_HEADERS[column],
    );
    worksheet.getCell(2, column + 1).value = sanitizeCellText(
      example[IMPORT_HEADERS[column]],
    );
  }
  worksheet.getRow(1).font = { bold: true };
  worksheet.getColumn(1).width = 28;
  worksheet.getColumn(2).width = 40;
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer.slice(0, buffer.byteLength);
}
