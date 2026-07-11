/**
 * Browser download helper (Task 9).
 *
 * Triggers a client-side file download for a generated {@link Blob} by creating
 * an object URL and clicking a temporary anchor. Kept isolated so the export
 * modules stay pure (Blob producers) and testable without touching the DOM.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoke on the next tick so the click has a chance to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
