import { strToU8, zipSync } from "fflate";

/**
 * A one-sheet Excel workbook (.xlsx), written by hand.
 *
 * An .xlsx file is a zip of a few XML files, and a list of names and phone
 * numbers needs only the smallest part of the format: text cells, a bold
 * header row that stays in view while scrolling, and column widths. That is
 * about sixty lines here against a library that would need to be kept up to
 * date. The zip itself is fflate's, synchronous on purpose: the libraries that
 * wrap it compress in a Web Worker started from a `blob:` address, which the
 * site's Content-Security-Policy refuses, and a list of participants is small
 * enough to compress on the spot.
 *
 * Every value is written as text, never as a number or a formula. A phone
 * number keeps its "+" and its spaces, and a name typed as "=HYPERLINK(...)"
 * stays a name: nothing in the file is ever calculated.
 *
 * Loaded only when she exports to Excel (lib/admin/export.ts imports it on
 * demand), so the admin panel's pages do not carry it.
 */

export interface SheetColumn {
  header: string;
  /** Width in characters, roughly. */
  width: number;
}

/** U+FFFE and U+FFFF, which XML forbids as well. */
const NONCHARACTERS = new RegExp(`[${String.fromCharCode(0xfffe, 0xffff)}]`, "g");

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Text made safe for XML: the five special characters escaped, characters XML forbids removed. */
function xmlText(value: string): string {
  return (
    value
      // Control characters other than tab and the line breaks are not allowed
      // in XML 1.0 at all, and Excel refuses the file over one.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(NONCHARACTERS, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

/** A1, B1, …, Z1, AA1: the address of a cell. */
function cellRef(column: number, row: number): string {
  let name = "";
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return `${name}${row}`;
}

function textCell(column: number, row: number, value: string, bold = false): string {
  if (!value) return "";
  return `<c r="${cellRef(column, row)}" t="inlineStr"${bold ? ' s="1"' : ""}><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
}

export function buildXlsx(sheetName: string, columns: SheetColumn[], rows: string[][]): Blob {
  const header = `<row r="1">${columns.map((c, i) => textCell(i, 1, c.header, true)).join("")}</row>`;
  const body = rows
    .map((cells, r) => `<row r="${r + 2}">${cells.map((value, i) => textCell(i, r + 2, value)).join("")}</row>`)
    .join("");

  const sheet =
    XML_HEADER +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${header}${body}</sheetData>` +
    "</worksheet>";

  // Sheet names may not contain : \ / ? * [ ] and stop at 31 characters.
  const safeName = sheetName.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet1";

  const files: Record<string, string> = {
    "[Content_Types].xml":
      XML_HEADER +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      "</Types>",
    "_rels/.rels":
      XML_HEADER +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>",
    "xl/workbook.xml":
      XML_HEADER +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets><sheet name="${xmlText(safeName)}" sheetId="1" r:id="rId1"/></sheets>` +
      "</workbook>",
    "xl/_rels/workbook.xml.rels":
      XML_HEADER +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>",
    // Two cell formats: the default (index 0) and bold text (index 1, the header).
    "xl/styles.xml":
      XML_HEADER +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>",
    "xl/worksheets/sheet1.xml": sheet,
  };

  const zipped = zipSync(
    Object.fromEntries(Object.entries(files).map(([path, xml]) => [path, strToU8(xml)])),
    { level: 6 }
  );
  return new Blob([zipped as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
