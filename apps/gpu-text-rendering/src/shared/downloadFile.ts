/** Starts a browser download. The caller owns the URL and must revoke object URLs when no longer needed. */
export function downloadFile(url: string, name: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
}
