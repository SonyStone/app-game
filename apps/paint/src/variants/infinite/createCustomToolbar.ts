import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal } from 'solid-js';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { findTool } from './toolCatalog';

/**
 * Infinite Painter's custom toolbar (manual p. 39): menu entries docked on the top bar, in the user's order, kept in
 * `localStorage`. `dock` inserts an entry at a slot, or moves it there when it is docked already; `undock` removes it.
 * Unknown ids from storage are dropped; storage failures keep the toolbar for this session.
 */
export function createCustomToolbar() {
  // `dock` and `undock` build on the list they last wrote, so several in one event keep every change.
  const [ids, setIds, latestIds] = createImmediateSignal(read());

  const save = (next: string[]) => {
    setIds(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Keep the toolbar for this session.
    }
  };

  return {
    /** Docked entry ids, left to right. */
    ids,
    dock(id: string, index: number) {
      const others = latestIds().filter((docked) => docked !== id);
      const at = Math.max(0, Math.min(others.length, index));
      save([...others.slice(0, at), id, ...others.slice(at)]);
    },
    undock(id: string) {
      save(latestIds().filter((docked) => docked !== id));
    }
  };
}

/**
 * An icon being dragged to or along the custom toolbar after a long press: from a menu (`menu`) or from the toolbar
 * itself (`dock`). It follows the pointer through window listeners until the press lifts, when `drop` receives it
 * with the lift point; a cancelled press drops nothing. Must be created within a Solid owner.
 */
export function createDockDrag(options: { drop: (drag: DockDrag, point: { x: number; y: number }) => void }) {
  const [drag, setDrag] = createSignal<DockDrag>();

  createEventListener(window, 'pointermove', (event) => {
    const current = drag();
    if (current && event.pointerId === current.pointerId) {
      setDrag({ ...current, at: { x: event.clientX, y: event.clientY } });
    }
  });
  createEventListener(window, 'pointerup', (event) => {
    const current = drag();
    if (current && event.pointerId === current.pointerId) {
      setDrag(undefined);
      options.drop(current, { x: event.clientX, y: event.clientY });
    }
  });
  createEventListener(window, 'pointercancel', (event) => {
    if (drag()?.pointerId === event.pointerId) {
      setDrag(undefined);
    }
  });

  return {
    /** The drag in progress, for the ghost icon. */
    drag,
    start(id: string, from: DockDrag['from'], point: { x: number; y: number }, pointerId: number) {
      setDrag({ id, from, at: point, pointerId });
    }
  };
}

/** A drag of entry `id` that the pointer `pointerId` holds, now at `at` in client CSS pixels. */
export type DockDrag = { id: string; from: 'menu' | 'dock'; at: { x: number; y: number }; pointerId: number };

function read(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string' && !!findTool(id)) : [];
  } catch {
    return [];
  }
}

const storageKey = 'paint.infinite.toolbar';
