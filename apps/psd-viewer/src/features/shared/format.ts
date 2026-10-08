/** A count with thousands separators. */
export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/** A byte size in B, KB or MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A boolean as an ARIA state attribute value. */
export function ariaState(value: boolean): 'true' | 'false' {
  return value ? 'true' : 'false';
}
