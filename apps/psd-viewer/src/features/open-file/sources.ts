import type { PsdRenderSettings } from '@app-game/psd/viewer';
import type { PsdSource } from '../document';

/** A chosen or dropped file as a document source. */
export function fileSource(file: File): PsdSource {
  return { name: file.name, read: () => file.arrayBuffer() };
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
