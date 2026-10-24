import { downloadBlob } from '../../shared/downloadBlob';
import { nativeShell, type NativeShellClient } from './shellClient';

/**
 * Saves `blob` as `name`: in the Android shell app into the device's Downloads/Paint, as a WebView cannot download a
 * blob, and elsewhere as a browser download. The shell gets the file in chunks of `chunkSize` bytes, one at a time,
 * so a large drawing is never copied whole; a failure part way drops what was written, and the shell says it could
 * not save. Resolves once the file is saved, or the browser download started.
 */
export async function saveFile(blob: Blob, name: string, client: NativeShellClient | undefined = nativeShell()) {
  if (!client) {
    downloadBlob(blob, name);
    return;
  }

  const begun = await client.request('saveBegin', { name, mime: blob.type });
  if (begun.isErr()) {
    throw begun.error;
  }

  const { id } = begun.value;
  try {
    for (let start = 0; start < blob.size; start += chunkSize) {
      const data = await base64(blob.slice(start, start + chunkSize));
      (await client.request('saveChunk', { id, data })).match(
        () => {},
        (error) => {
          throw error;
        }
      );
    }

    (await client.request('saveEnd', { id })).match(
      () => {},
      (error) => {
        throw error;
      }
    );
  } catch (error) {
    await client.request('saveCancel', { id });
    throw error;
  }
}

/** Bytes per chunk: about 1.4 MB of base64 per message. */
const chunkSize = 1 << 20;

/** `blob` as base64, encoded by the browser rather than byte by byte in script. */
function base64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file to save'));
    reader.readAsDataURL(blob);
  });
}
