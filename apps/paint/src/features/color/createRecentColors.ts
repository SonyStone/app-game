import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { parseHex } from './hsv';

/**
 * Most recently applied colors, newest first, persisted in `localStorage` so they survive closing the panel and
 * reloading. Storage failures (private mode, quota) leave the list working for the current panel only.
 */
export function createRecentColors() {
  // `remember` builds on the list it last wrote, so repeated calls in one event keep every color.
  const [colors, setColors, latestColors] = createImmediateSignal(read());

  return {
    /** Up to {@link LIMIT} distinct lowercase `#rrggbb` colors. */
    colors,
    /** Moves `hex` to the front, dropping a duplicate and the oldest entry beyond the limit. */
    remember(hex: string) {
      const next = [hex, ...latestColors().filter((color) => color !== hex)].slice(0, LIMIT);
      setColors(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Recents are a convenience; keep the in-memory list.
      }
    }
  };
}

function read(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(stored)) {
      return [];
    }

    // Normalizing can turn distinct stored spellings (`#FFF`, `#ffffff`) into the same color.
    const colors = stored.flatMap((value) => (typeof value === 'string' ? (parseHex(value) ?? []) : []));
    return [...new Set(colors)].slice(0, LIMIT);
  } catch {
    return [];
  }
}

const KEY = 'paint.recentColors';
const LIMIT = 12;
