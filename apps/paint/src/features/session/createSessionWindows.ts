import { createImmediateSignal } from '../../shared/createImmediateSignal';

/**
 * Which of the session's floating windows are open and where, remembered in `localStorage` for every variant: a
 * window opened in one variant is open in the next, at the same place. `PaintEditor` shows them over the variant's
 * UI; a variant only opens them, from wherever its menus are. Storage failures keep the windows for this page.
 */
export function createSessionWindows() {
  const [, setStored, stored] = createImmediateSignal(read());

  return {
    isOpen: (id: SessionWindowId) => stored()[id]?.open ?? false,
    /** The window's top-left corner, or its default place until it was moved. */
    position: (id: SessionWindowId) => stored()[id]?.position ?? defaultPosition(id),
    open: (id: SessionWindowId) => update(id, { open: true }),
    close: (id: SessionWindowId) => update(id, { open: false }),
    toggle: (id: SessionWindowId) => update(id, { open: !(stored()[id]?.open ?? false) }),
    /** Moves the window; `done` once a drag ends, which remembers the place. */
    move(id: SessionWindowId, position: { x: number; y: number }, done: boolean) {
      update(id, { position }, done);
    }
  };

  function update(id: SessionWindowId, patch: Partial<WindowState>, save = true) {
    const next = { ...stored(), [id]: { open: false, ...stored()[id], ...patch } };
    setStored(next);
    if (!save) {
      return;
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Keep the windows for this page.
    }
  }
}

/**
 * The session's windows: `palette`, the mixing palette (see `MixingPaletteWindow`), and `pen`, palm rejection and
 * what to do when Chrome loses the pen hover.
 */
export type SessionWindowId = 'palette' | 'pen';

type WindowState = { open: boolean; position?: { x: number; y: number } };

/** The palette at the top right, below a variant's top bar; the pen settings in the middle. */
function defaultPosition(id: SessionWindowId) {
  return id === 'palette'
    ? { x: Math.max(8, innerWidth - 336), y: 72 }
    : { x: Math.max(8, innerWidth / 2 - 160), y: Math.max(8, innerHeight / 2 - 220) };
}

function read(): Partial<Record<SessionWindowId, WindowState>> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    const windows: Partial<Record<SessionWindowId, WindowState>> = {};
    for (const id of ['palette', 'pen'] as const) {
      const value = (stored as Record<string, unknown> | null)?.[id] as Partial<WindowState> | undefined;
      if (typeof value?.open !== 'boolean') {
        continue;
      }

      const position = value.position;
      windows[id] =
        typeof position?.x === 'number' &&
        typeof position.y === 'number' &&
        Number.isFinite(position.x) &&
        Number.isFinite(position.y)
          ? { open: value.open, position: { x: position.x, y: position.y } }
          : { open: value.open };
    }

    return windows;
  } catch {
    return {};
  }
}

const storageKey = 'paint.windows';
