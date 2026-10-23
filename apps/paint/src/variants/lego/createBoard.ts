import { z } from 'zod';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import type { Board } from './board';

/**
 * The LEGO variant's board on this device, kept in `localStorage`; a missing or malformed one starts from
 * `defaultBoard`. Storage failures keep the board until the page closes.
 */
export function createBoard() {
  // Drags build on the last write, so several in one event compose.
  const [board, setBoard, latest] = createImmediateSignal<Board>(read());
  const set = (next: Board) => {
    setBoard(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // The board still applies until the page closes.
    }
  };

  return {
    board,
    /** The board as last set, also within the event that set it. */
    latest,
    /** Replaces the board and stores it. */
    set,
    /** Puts the default board back. */
    reset: () => set(defaultBoard)
  };
}

const storageKey = 'paint.lego';

const point = z.object({ x: z.number(), y: z.number() });
const boardSchema = z.object({
  panels: z.array(
    z.object({
      id: z.string(),
      at: point,
      parts: z.array(
        z.object({
          id: z.string(),
          kind: z.string(),
          cell: z.object({ column: z.number().int(), row: z.number().int() }),
          span: z.object({ columns: z.number().int().min(1), rows: z.number().int().min(1) }),
          looks: z.record(z.string(), z.string()).optional(),
          popup: z.string().optional()
        })
      )
    })
  )
});

function read(): Board {
  try {
    const stored = localStorage.getItem(storageKey);
    const parsed = stored ? boardSchema.safeParse(JSON.parse(stored)) : undefined;
    return parsed?.success ? parsed.data : defaultBoard;
  } catch {
    return defaultBoard;
  }
}

/**
 * The board a first visit sees: brushes, eraser, undo, redo and local undo on the left, the color across the top and the size
 * and opacity standing on the right, in a mix of sizes that shows how a part changes as it grows.
 */
export const defaultBoard: Board = {
  panels: [
    {
      id: 'tools',
      at: { x: 0.02, y: 0.2 },
      parts: [
        { id: 'soft', kind: 'preset:builtin:soft-round', cell: { column: 0, row: 0 }, span: { columns: 3, rows: 2 } },
        { id: 'eraser', kind: 'action:eraser', cell: { column: 0, row: 2 }, span: { columns: 3, rows: 1 } },
        { id: 'undo', kind: 'action:undo', cell: { column: 0, row: 3 }, span: { columns: 1, rows: 1 } },
        { id: 'redo', kind: 'action:redo', cell: { column: 1, row: 3 }, span: { columns: 1, rows: 1 } },
        { id: 'size-knob', kind: 'value:size', cell: { column: 2, row: 3 }, span: { columns: 1, rows: 1 } },
        { id: 'local-undo', kind: 'action:local-undo', cell: { column: 0, row: 4 }, span: { columns: 3, rows: 1 } }
      ]
    },
    {
      id: 'colors',
      at: { x: 0.3, y: 0.02 },
      parts: [
        { id: 'color', kind: 'color', cell: { column: 0, row: 0 }, span: { columns: 2, rows: 2 } },
        { id: 'hue', kind: 'value:hue', cell: { column: 2, row: 0 }, span: { columns: 5, rows: 1 } },
        { id: 'brightness', kind: 'value:brightness', cell: { column: 2, row: 1 }, span: { columns: 5, rows: 1 } }
      ]
    },
    {
      id: 'stroke',
      at: { x: 0.95, y: 0.3 },
      parts: [
        { id: 'size', kind: 'value:size', cell: { column: 0, row: 0 }, span: { columns: 1, rows: 4 } },
        { id: 'opacity', kind: 'value:opacity', cell: { column: 1, row: 0 }, span: { columns: 1, rows: 4 } }
      ]
    }
  ]
};
