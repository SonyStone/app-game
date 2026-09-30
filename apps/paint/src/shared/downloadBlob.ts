/**
 * Starts a browser download of `blob` as `name`. The object URL is revoked after 30 seconds, which leaves the browser
 * enough time to start reading it without keeping large drawings alive for the rest of the session.
 */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
}

const revokeAfterMs = 30_000;
