/**
 * Reads a Blob without a Solid owner. Aborting stops the read and rejects with the signal's reason.
 * Progress includes zero and the final byte count. A throwing progress callback rejects the read.
 */
export function readFileBytes(
  file: Blob,
  options: {
    /** Cancels this read, including before it starts. */
    signal?: AbortSignal;
    /** Receives the completed and total byte counts. */
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<ArrayBuffer> {
  const { signal, onProgress } = options;
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    reader.onprogress = (event) => report(event.loaded);
    reader.onload = () => {
      if (report(file.size)) resolve(reader.result as ArrayBuffer);
    };
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(signal?.reason ?? new DOMException('Operation cancelled', 'AbortError'));
    reader.onloadend = cleanup;
    signal?.addEventListener('abort', abort, { once: true });
    try {
      if (report(0)) reader.readAsArrayBuffer(file);
    } catch (cause) {
      cleanup();
      reject(cause);
    }

    function report(completed: number) {
      try {
        onProgress?.(completed, file.size);
        signal?.throwIfAborted();
        return true;
      } catch (cause) {
        reject(cause);
        cleanup();
        reader.abort();
        return false;
      }
    }
  });
}
