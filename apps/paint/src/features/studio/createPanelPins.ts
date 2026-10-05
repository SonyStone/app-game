import { createImmediateSignal } from '../../shared/createImmediateSignal';
import type { PanelId } from './StudioPanel';

/**
 * Which side panels stay open while the canvas is used, remembered in `localStorage`. An unpinned panel closes as soon
 * as a contact starts on the canvas; a pinned one stays until it is closed. Storage failures keep the choice for this
 * session.
 */
export function createPanelPins() {
  const [, setPinned, pinned] = createImmediateSignal<readonly PanelId[]>(read());

  return {
    /** Whether `id` stays open while the canvas is used. */
    pinned: (id: PanelId) => pinned().includes(id),
    /** Pins or unpins `id` and remembers it. */
    setPinned(id: PanelId, on: boolean) {
      const next = on ? [...new Set([...pinned(), id])] : pinned().filter((other) => other !== id);
      setPinned(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Keep the choice for this session.
      }
    }
  };
}

function read(): PanelId[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is PanelId => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

const storageKey = 'paint.pinnedPanels';
