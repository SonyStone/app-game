/**
 * Starts a browser download of `blob` as `name`. The object URL stays valid until the next download, because a browser
 * that asks the user to confirm (Safari) reads it only after they answer; at most one file is kept alive this way.
 */
export function downloadBlob(blob: Blob, name: string) {
  if (pendingUrl) {
    URL.revokeObjectURL(pendingUrl);
  }

  pendingUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = pendingUrl;
  link.download = name;
  link.click();
}

/** The URL of the last download, revoked when the next one starts. */
let pendingUrl: string | undefined;
