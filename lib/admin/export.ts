/**
 * Exporting a list from the admin as a spreadsheet: CSV or Excel.
 *
 * CSV THAT EXCEL OPENS AS SHE EXPECTS
 *
 *   - A byte-order mark first. Without it Excel reads the file as the
 *     Windows code page and every ă, ș and ț turns into two odd characters.
 *   - Semicolons between the columns. Excel splits a CSV on the list
 *     separator of the computer's regional settings, and in Romania that is
 *     the semicolon (the comma is the decimal separator). Google Sheets and
 *     LibreOffice notice either.
 *   - Every value in double quotes, so a comma, a semicolon or a line break
 *     inside a name or an event title stays inside its cell.
 *   - Formulas disarmed. A cell beginning with = + - @ (or a tab or carriage
 *     return, which Excel skips before looking) is run as a formula when the
 *     file is opened: a name typed into the booking form as
 *     `=HYPERLINK("http://evil.example","Click")` would become a live link in
 *     her spreadsheet. Such a cell gets an apostrophe in front, which makes
 *     it text; Excel shows the apostrophe, which is why phone numbers ("+40
 *     …") carry one in the CSV and why the Excel button writes a real
 *     workbook, where every cell is text and needs nothing in front.
 *
 * Health notes are never among the columns (see the callers).
 */

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string;
  /** Column width in the Excel file, in characters. */
  width?: number;
}

export type ExportFormat = "xlsx" | "csv";

/** U+FEFF: tells Excel the file is UTF-8. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** A cell a spreadsheet would run as a formula gets an apostrophe in front. */
function disarm(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string): string {
  return `"${disarm(value).replace(/"/g, '""')}"`;
}

export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): Blob {
  const lines = [
    columns.map((c) => csvCell(c.header)).join(";"),
    ...rows.map((row) => columns.map((c) => csvCell(c.value(row) ?? "")).join(";")),
  ];
  return new Blob([BYTE_ORDER_MARK + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
}

/** The same table as an Excel workbook. The writer is loaded on the first export, not with the page. */
export async function toXlsx<T>(rows: T[], columns: ExportColumn<T>[], sheetName: string): Promise<Blob> {
  const { buildXlsx } = await import("@/lib/admin/xlsx");
  return buildXlsx(
    sheetName,
    columns.map((c) => ({ header: c.header, width: c.width ?? 18 })),
    rows.map((row) => columns.map((c) => c.value(row) ?? ""))
  );
}

/** Hands a file to the browser to save. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked a moment later: Safari has not always started reading the file
  // when click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
