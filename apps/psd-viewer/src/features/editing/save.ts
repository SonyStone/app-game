import type { EditingRequest, EditingResponse, EditingResult } from './contracts';

/** A transactional destination. close is called only after EOF; abort must discard pending writes. */
export type SaveDestination = {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
};

/**
 * Consumes a frozen save in 1 MiB chunks. The freeze occurs before the asynchronous destination prompt.
 * Every outcome releases the WASM save, including cancellation, a failed write/close and document replacement.
 * A later edit does not invalidate these independently frozen bytes. Completion refers to its captured revision.
 */
export async function streamSave(
  rpc: (request: EditingRequest) => Promise<EditingResult<EditingResponse>>,
  revision: number,
  destination: () => Promise<SaveDestination>,
  signal: AbortSignal,
  progress: (bytes: number) => void = () => undefined
): Promise<number> {
  let save: string | undefined;
  let target: SaveDestination | undefined;
  let complete = false;
  let written = 0;
  try {
    signal.throwIfAborted();
    const frozen = unwrap(await rpc({ kind: 'freeze', revision }));
    if (frozen.kind !== 'frozen' || frozen.revision !== revision) {
      if (frozen.kind === 'frozen') {
        save = frozen.save;
      }
      throw new Error('Stale frozen save reply.');
    }
    save = frozen.save;
    signal.throwIfAborted();
    target = await chooseDestination(destination, signal);
    signal.throwIfAborted();
    while (true) {
      const chunk = unwrap(await rpc({ kind: 'chunk', save, maxBytes: 1024 * 1024 }));
      signal.throwIfAborted();
      if (chunk.kind !== 'chunk') {
        throw new Error('Unexpected save chunk reply.');
      }
      if (!chunk.bytes) {
        break;
      }
      await target.write(chunk.bytes);
      written += chunk.bytes.byteLength;
      progress(written);
    }
    signal.throwIfAborted();
    await target.close();
    complete = true;
    return written;
  } finally {
    try {
      if (target && !complete) {
        await target.abort();
      }
    } finally {
      if (save !== undefined) {
        await rpc({ kind: 'release', save });
      }
    }
  }
}

/** Uses transactional File System Access where available. Fallback publishes a download only after EOF. */
export async function browserDestination(name: string): Promise<SaveDestination> {
  if ('showSaveFilePicker' in window && typeof window.showSaveFilePicker === 'function') {
    const handle = await (
      window.showSaveFilePicker as (options: unknown) => Promise<{
        createWritable(): Promise<SaveDestination>;
      }>
    )({
      suggestedName: name,
      types: [{ description: 'Photoshop document', accept: { 'image/vnd.adobe.photoshop': ['.psd', '.psb'] } }]
    });
    return handle.createWritable();
  }

  let chunks: BlobPart[] = [];
  return {
    async write(chunk) {
      chunks.push(new Uint8Array(chunk));
    },
    async close() {
      const url = URL.createObjectURL(new Blob(chunks, { type: 'image/vnd.adobe.photoshop' }));
      chunks = [];
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      // Revocation must follow the browser's navigation to the completed Blob.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    async abort() {
      chunks = [];
    }
  };
}

/** Release frozen bytes immediately on cancel, and abort any destination returned by a late picker. */
function chooseDestination(destination: () => Promise<SaveDestination>, signal: AbortSignal): Promise<SaveDestination> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
      return;
    }

    void Promise.resolve()
      .then(destination)
      .then(
        (target) => {
          signal.removeEventListener('abort', abort);
          if (signal.aborted) {
            void target.abort().catch(() => undefined);
          } else {
            resolve(target);
          }
        },
        (error) => {
          signal.removeEventListener('abort', abort);
          reject(error);
        }
      );
  });
}

function unwrap<T>(result: EditingResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}
