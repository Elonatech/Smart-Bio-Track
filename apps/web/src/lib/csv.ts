// Shared CSV building/download used by the HR Reports and Payroll
// Export pages. Both build their file in the browser from what's already
// on screen — no endpoint involved, and what downloads is exactly what
// was filtered.

// Byte-order mark prepended to every file. Built from its code point
// rather than pasted in, so it isn't an invisible character sitting in
// the source that someone later deletes by accident. Without it Excel
// reads the file as the local codepage and mangles any non-ASCII
// character — including the ₦ sign.
const UTF8_BOM = String.fromCharCode(0xfeff);

/**
 * Escapes one CSV field. A value containing a comma, quote or newline
 * has to be wrapped in quotes with any inner quote doubled — otherwise
 * the file breaks the moment a name contains a comma.
 */
export function toCsvField(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Turns rows into a CSV file and hands it to the browser as a download.
 *
 * Pass raw numbers, not formatted strings — "₦640,000" arrives in a
 * spreadsheet as text you can't sum, while 640000 arrives as a number.
 */
export function downloadCsv(
  filename: string,
  rows: (string | number)[][]
): void {
  const csv = rows
    .map((row) => row.map(toCsvField).join(","))
    // CRLF is what Excel expects.
    .join("\r\n");

  const blob = new Blob([UTF8_BOM, csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  // The link has to be in the document for the click to count as a
  // user-initiated download in every browser.
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Released on the next tick rather than immediately — revoking
  // synchronously can cancel the download that was just started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
