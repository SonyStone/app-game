import type { PsdRenderSettings } from '@app-game/psd/viewer';
import type { PsdSource } from '../document';
import { requiresWindowedRendering } from '../psd-worker/protocol';

/**
 * A chosen or dropped file. Small canvases use an asynchronous transferable read while the display warms.
 * Files over 128 MiB, PSBs over 64 MiB, and huge canvases retain bounded worker-owned Blob reads.
 */
export function fileSource(file: File): PsdSource {
  return {
    name: file.name,
    read: async () => {
      if (file.size > 128 * 1024 ** 2) {
        return file;
      }

      const header = new DataView(await file.slice(0, 26).arrayBuffer());
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

      return file.arrayBuffer();
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
