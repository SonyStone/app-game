import { createEffect, type Accessor } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';

/**
 * Brush presets in the order they were last used, newest first, persisted in `localStorage`. Every preset that
 * `current` reports is remembered. Storage failures leave the list working until the page closes. Must be created
 * within a Solid owner.
 */
export function createRecentPresets(options: {
  /** The preset in use; each new value moves to the front. */
  current: Accessor<string | undefined>;
  /** Whether a preset still exists; deleted presets are skipped. */
  exists: (id: string) => boolean;
}) {
  const [ids, setIds, latestIds] = createImmediateSignal(read());

  createEffect(options.current, (id) => {
    if (id === undefined) {
      return;
    }

    const next = [id, ...latestIds().filter((candidate) => candidate !== id)].slice(0, limit);
    setIds(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Recents are a convenience; keep the in-memory list.
    }
  });

  return {
    /** Up to `count` existing presets other than the current one, most recently used first. */
    recent: (count: number) =>
      ids()
        .filter((id) => id !== options.current() && options.exists(id))
        .slice(0, count)
  };
}

function read(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id) => typeof id === 'string').slice(0, limit) : [];
  } catch {
    return [];
  }
}

const key = 'paint.recentPresets';

/** Presets remembered; more than are shown, so deleted ones leave room. */
const limit = 8;
