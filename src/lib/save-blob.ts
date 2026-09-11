/**
 * Hands a blob to the browser as a file download.
 *
 * Shared because two features now produce files from different sources — the
 * certificate PDFs the API renders, and the mark-sheet workbook the browser
 * builds — and both have to get past the same Safari quirk below.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking immediately can cancel the download in Safari, so the object URL is
  // released on the next tick instead.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
