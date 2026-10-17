import { createImmediateSignal } from '../../shared/createImmediateSignal';

/**
 * The brushes marked with the brush selector's heart, newest first, kept in `localStorage` under
 * `paint.infinite.favorites` so that the Favorites folder survives a reload. Ids of presets deleted since stay in the
 * list; the selector skips them. Storage failures keep the list until the page closes.
 */
export function createBrushFavorites() {
  const [favorites, setFavorites, latest] = createImmediateSignal(read());

  return {
    /** Preset ids of the favorite brushes, newest first. */
    favorites,
    /** Marks `id` as a favorite, or unmarks it if it is one. */
    toggle(id: string) {
      const list = latest();
      const next = list.includes(id) ? list.filter((entry) => entry !== id) : [id, ...list];
      setFavorites(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Favorites are a convenience; keep the in-memory list.
      }
    }
  };
}

/** Stored favorites; anything but a list of strings reads as none. */
function read(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

const storageKey = 'paint.infinite.favorites';
