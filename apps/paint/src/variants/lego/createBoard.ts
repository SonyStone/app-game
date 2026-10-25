import { z } from 'zod';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import type { Board } from './board';
import { layersKit } from './layersKit';
import { createPartStorage, migrateParts, migrateWindows, storedPart, storedWindow } from './partStorage';
import { swatchPanelParts } from './swatchPanelParts';

/**
 * The LEGO variant's board on this device, kept in `localStorage`; missing or hard-corrupt storage starts from
 * `defaultBoard` after backing up corrupt data. Malformed parts remain on the board. Storage failures keep the
 * board until the page closes. `onSavingError` reports refused or failed saves.
 */
export function createBoard(onSavingError?: (message: string) => void) {
  // Drags build on the last write, so several in one event compose.
  const storage = createPartStorage('paint.lego', 'board', defaultBoard, read, onSavingError);
  const [board, setBoard, latest] = createImmediateSignal<Board>(storage.initial);
  const set = (next: Board) => {
    setBoard(next);
    storage.write(next);
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

const point = z.looseObject({ x: z.number(), y: z.number() });
const boardSchema = z.looseObject({
  panels: z.array(
    z.looseObject({
      id: z.string(),
      at: point,
      parts: z.array(storedPart),
      owner: z.string().optional(),
      window: storedWindow.optional(),
      offset: z.looseObject({ column: z.number().int(), row: z.number().int() }).optional(),
      bench: z.literal(true).optional()
    })
  )
});

/** Loads every part independently and appends panels introduced by shared migrations. */
function read(data: unknown, version: number): Board {
  const board = boardSchema.parse(data);
  const added: Board['panels'] = [];
  const panels = board.panels.map((panel) => {
    const result = migrateParts(panel.parts, version);
    added.push(...result.owned.map((entry) => ({ ...entry, id: `${entry.owner}-panel`, at: { x: 0, y: 0 } })));
    return { ...panel, parts: result.parts };
  });

  return migrateWindows({ ...board, panels: [...panels, ...added] }, version);
}

/** The default panel swatch `owner` opens, its part ids prefixed with the owner's to keep them unique. */
function swatchPanel(owner: string): Board['panels'][number] {
  return {
    id: `${owner}-panel`,
    at: { x: 0, y: 0 },
    owner,
    parts: swatchPanelParts.map((part) => ({ ...part, id: `${owner}-${part.id}` }))
  };
}

/**
 * The board a first visit sees: on the left everything a sketch, a fill and layers take (a brush, the brush library,
 * the eraser, the lasso, the fill and the transform, undo and redo with the size, the layers and the local undo) and
 * the file commands; the
 * color across the top (a swatch opening its panel of pickers, hue and brightness) and the size and opacity standing
 * on the right, in a mix of sizes that shows how a part changes as it grows.
 */
export const defaultBoard: Board = {
  panels: [
    {
      id: 'tools',
      at: { x: 0.02, y: 0.12 },
      parts: [
        { id: 'soft', kind: 'preset:builtin:soft-round', cell: { column: 0, row: 0 }, span: { columns: 3, rows: 2 } },
        { id: 'brushes', kind: 'action:brushes', cell: { column: 0, row: 2 }, span: { columns: 3, rows: 1 } },
        { id: 'eraser', kind: 'action:eraser', cell: { column: 0, row: 3 }, span: { columns: 3, rows: 1 } },
        { id: 'lasso', kind: 'action:lasso', cell: { column: 0, row: 4 }, span: { columns: 1, rows: 1 } },
        { id: 'fill', kind: 'action:fill', cell: { column: 1, row: 4 }, span: { columns: 1, rows: 1 } },
        { id: 'transform', kind: 'action:transform', cell: { column: 2, row: 4 }, span: { columns: 1, rows: 1 } },
        { id: 'undo', kind: 'action:undo', cell: { column: 0, row: 5 }, span: { columns: 1, rows: 1 } },
        { id: 'redo', kind: 'action:redo', cell: { column: 1, row: 5 }, span: { columns: 1, rows: 1 } },
        { id: 'size-knob', kind: 'value:size', cell: { column: 2, row: 5 }, span: { columns: 1, rows: 1 } },
        { id: 'local-undo', kind: 'action:local-undo', cell: { column: 0, row: 6 }, span: { columns: 3, rows: 1 } },
        { id: 'file', kind: 'action:file', cell: { column: 0, row: 7 }, span: { columns: 3, rows: 1 } }
      ]
    },
    {
      id: 'colors',
      at: { x: 0.3, y: 0.02 },
      parts: [
        { id: 'color', kind: 'color:swatch', cell: { column: 0, row: 0 }, span: { columns: 2, rows: 2 } },
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
    },
    swatchPanel('color'),
    {
      id: 'layers-panel',
      at: { x: 0.17, y: 0.5 },
      window: { ...layersKit.window, collapsed: true },
      parts: layersKit.parts.map((part) => ({ ...part, id: `layers-${part.id}` }))
    }
  ]
};
