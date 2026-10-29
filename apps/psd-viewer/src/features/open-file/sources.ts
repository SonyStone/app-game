import type { PsdRenderSettings } from '@app-game/psd/viewer';
import type { PsdSource } from '../document';
import { requiresWindowedRendering } from '../psd-worker/protocol';

/**
 * A chosen or dropped file. Small canvases use one asynchronous stream and transfer its bytes while the display warms.
 * Files over 128 MiB, PSBs over 64 MiB, and huge canvases retain bounded worker-owned Blob reads.
 * Header admission and content share the stream, avoiding a second file-read queue wait under load.
 */
export function fileSource(file: File): PsdSource {
  return {
    name: file.name,
    read: async () => {
      if (file.size > 128 * 1024 ** 2) {
        return file;
      }

      const reader = file.stream().getReader();
      try {
        const prefix: Uint8Array[] = [];
        let prefixBytes = 0;
        while (prefixBytes < 26) {
          const chunk = await reader.read();
          if (chunk.done) {
            break;
          }

          prefix.push(chunk.value);
          prefixBytes += chunk.value.byteLength;
        }

        const headerBytes = new Uint8Array(Math.min(26, prefixBytes));
        let copied = 0;
        for (const chunk of prefix) {
          const count = Math.min(chunk.byteLength, headerBytes.byteLength - copied);
          headerBytes.set(chunk.subarray(0, count), copied);
          copied += count;
        }

        const header = new DataView(headerBytes.buffer);
        if (
          header.byteLength >= 26 &&
          header.getUint32(0) === 0x38425053 &&
          ((header.getUint16(4) === 2 && file.size > 64 * 1024 ** 2) ||
            requiresWindowedRendering({
              width: header.getUint32(18),
              height: header.getUint32(14)
            }))
        ) {
          return file;
        }

        const bytes = new Uint8Array(file.size);
        let offset = 0;
        for (const chunk of prefix) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }

        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) {
            return bytes.buffer;
          }

          bytes.set(chunk.value, offset);
          offset += chunk.value.byteLength;
        }
      } finally {
        try {
          await reader.cancel();
        } finally {
          reader.releaseLock();
        }
      }
    },
    mode: new URLSearchParams(location.search).get('current') === '1' ? 'strict' : undefined
  };
}

/** A document fetched from `url`, such as a bundled example, opened with `settings`. */
export function urlSource(name: string, url: string, settings?: PsdRenderSettings): PsdSource {
  return {
    name,
    settings,
    read: async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.arrayBuffer();
    }
  };
}

/** The first Photoshop document among `files`, by extension. */
export function firstPsd(files: File[]): File | undefined {
  return files.find((file) => /\.ps[db]$/i.test(file.name));
}
