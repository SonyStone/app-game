import { createSignal } from 'solid-js';
import { parseHex } from './hsv';

/**
 * Most recently applied colors, newest first, persisted in `localStorage` so they survive closing the panel and
 * reloading. Storage failures (private mode, quota) leave the list working for the current panel only.
 */
export function createRecentColors() {
  const [colors, setColors] = createSignal(read());

  return {
    /** Up to {@link LIMIT} distinct lowercase `#rrggbb` colors. */
    colors,
    /** Moves `hex` to the front, dropping a duplicate and the oldest entry beyond the limit. */
    remember(hex: string) {
      const next = [hex, ...colors().filter((color) => color !== hex)].slice(0, LIMIT);
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
    return Array.isArray(stored)
      ? stored.flatMap((value) => (typeof value === 'string' ? (parseHex(value) ?? []) : [])).slice(0, LIMIT)
      : [];
  } catch {
    return [];
  }
}

const KEY = 'paint.recentColors';
const LIMIT = 12;
