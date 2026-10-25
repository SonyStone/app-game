/**
 * The LEGO board: panels lie freely on the drawing, each one a grid of studs, and parts sit on a panel's studs like
 * printed tiles. A part covers any whole number of cells; it never overlaps another part, so placing or growing one
 * pushes the parts in its way aside, and a panel is exactly as large as the parts on it. Only popups float over parts.
 *
 * Everything here is pure: the view calls these functions with the board as it was when a drag started, so the
 * result follows the pointer and moving back restores what was there.
 */

/** A board: the panels lying on the drawing, in paint order. */
export type Board = { panels: Panel[] };

/**
 * A panel lying on the drawing. `at` places its cell (0, 0) as fractions of the view's width and height, so the
 * layout keeps its proportions when the view resizes or turns; cells left of or above it have negative indices,
 * which lets a panel grow toward the top and left without moving its parts on screen.
 */
export type Panel = {
  id: string;
  at: Point;
  parts: Part[];
  /**
   * The part this panel belongs to. Folders follow their owner and the single open chain. Windows persist their
   * own open state and, after their handle is dragged, lie independently at `at`.
   */
  owner?: string;
  /** A handle turns a plate into a persistent window. Owned windows start closed beside their owner. */
  window?: {
    name: string;
    collapsed?: true;
    open?: true;
    /** Set after dragging the handle: `at` then stays independent of the owner. */
    placed?: true;
  };
  /**
   * Where an owned panel lies from its part: its cell (0, 0) this many cells from the part's top-left cell, which may
   * put it over the part. Without it the panel lies beside the part where there is room (see `ownedFrame`).
   */
  offset?: Cell;
  /**
   * Whether this is the workbench: the plate in the fully pulled-out box where a kit is built at full size, shown
   * only there; dragged out by its rim it becomes a panel on the drawing.
   */
  bench?: true;
};

/**
 * A part on a panel: what it is (`kind`, see `parts.tsx`), its top-left cell and the cells it covers. A part with
 * several looks keeps the ones the user chose per size (see `looks.ts`).
 */
export type Part = {
  id: string;
  kind: string;
  cell: Cell;
  span: Span;
  /** Look ids by `spanKey` of the size they were chosen at. */
  looks?: Record<string, string>;
  /** Original persisted data, retained across moves and copies, including fields this version cannot read. */
  [partData]?: { record: unknown; invalid: boolean; initial?: Pick<Part, 'id' | 'cell' | 'span'> };
};

/** Internal storage metadata uses a symbol so future JSON fields cannot be mistaken for it. */
export const partData = Symbol('stored part data');

export type Point = { x: number; y: number };
export type Cell = { column: number; row: number };
export type Span = { columns: number; rows: number };

/** Edge of one stud cell in CSS pixels, the size of the smallest part. */
export const cellSize = 44;
/** Space between neighbouring cells in CSS pixels. */
export const cellGap = 4;
/** Distance from one cell to the next. */
export const pitch = cellSize + cellGap;
/** Panel border around its cells in CSS pixels. */
export const panelPadding = 6;
/** The largest span of a part in either direction. */
export const maxSpan = 10;
/** Height of the window handle, outside the stud cells. */
export const windowHandleHeight = 36;

/**
 * A way a part can be pushed. Only right and down: a push then never moves a panel's parts toward the top or left,
 * so a panel grows only on its right and bottom, and one lying at the view's right or bottom edge is the only kind
 * that shifts on screen.
 */
export type Direction = 'right' | 'down';

/**
 * Puts `moving` among `parts` (replacing the part of the same id) and pushes every part it would overlap out of its
 * way: `way` picks the direction for each part `moving` overlaps (by default the shorter way, see `shorterWay`), and
 * parts a pushed part then overlaps move on in the same direction. `moving` itself stays where it is asked to be.
 * Keeps the parts' order.
 */
export function placePart(
  parts: readonly Part[],
  moving: Part,
  way: (part: Part, moving: Part) => Direction = shorterWay
) {
  const placed = new Map(parts.map((part) => [part.id, part]));
  placed.set(moving.id, moving);
  const queue: { id: string; direction?: Direction }[] = [{ id: moving.id }];

  // Pushes only move away from their pusher, so the queue drains; the guard only stops a malformed board.
  for (let guard = 0; queue.length > 0 && guard < 10_000; guard++) {
    const { id, direction } = queue.shift()!;
    const pusher = placed.get(id)!;

    for (const other of [...placed.values()]) {
      if (other.id === pusher.id || other.id === moving.id || !overlaps(other, pusher)) {
        continue;
      }

      const toward = direction ?? way(other, pusher);
      placed.set(other.id, { ...other, cell: pushedCell(other, pusher, toward) });
      queue.push({ id: other.id, direction: toward });
    }
  }

  return [...placed.values()];
}

/**
 * Gives part `id` a new `span` from its top-left cell, clamped to 1…`maxSpan`. Parts in the way are pushed right
 * or down, the ways a corner handle drags: right when they lie beside the part's old rows, down when they lie
 * under its old columns, and the shorter way when they lie diagonally.
 */
export function resizePart(parts: readonly Part[], id: string, span: Span) {
  const part = parts.find((candidate) => candidate.id === id);
  if (!part) {
    return [...parts];
  }

  const clamped = { columns: clampSpan(span.columns), rows: clampSpan(span.rows) };
  return placePart(parts, { ...part, span: clamped }, (other, grown) => {
    if (bandsMeet(other.cell.row, other.span.rows, part.cell.row, part.span.rows)) {
      return 'right';
    }

    if (bandsMeet(other.cell.column, other.span.columns, part.cell.column, part.span.columns)) {
      return 'down';
    }

    return shorterWay(other, grown);
  });
}

/** The cells `parts` cover together; one empty cell at (0, 0) for none. */
export function partsBounds(parts: readonly Part[]) {
  if (parts.length === 0) {
    return { column: 0, row: 0, columns: 1, rows: 1 };
  }

  const column = Math.min(...parts.map((part) => part.cell.column));
  const row = Math.min(...parts.map((part) => part.cell.row));
  const right = Math.max(...parts.map((part) => part.cell.column + part.span.columns));
  const bottom = Math.max(...parts.map((part) => part.cell.row + part.span.rows));
  return { column, row, columns: right - column, rows: bottom - row };
}

/**
 * Where `panel` lies in a view of `view` size, in CSS pixels: `origin` is the top-left of its cell (0, 0) and `rect`
 * its whole box with the padding. A panel partly off screen is shifted back in, so a turned or smaller view never
 * hides parts; its stored `at` is kept.
 */
export function panelFrame(panel: Panel, view: { width: number; height: number }) {
  const { rect } = frameAt(panel, { x: 0, y: 0 });
  const { width, height } = rect;
  const wanted = {
    x: panel.at.x * view.width + rect.left,
    y: panel.at.y * view.height + rect.top
  };
  const left = Math.max(0, Math.min(wanted.x, view.width - width));
  const top = Math.max(0, Math.min(wanted.y, view.height - height));
  const origin = { x: left - rect.left, y: top - rect.top };

  return { origin, rect: { left, top, width, height } };
}

/**
 * Where `panel` lies when its cell (0, 0) starts at `origin`, as `panelFrame` gives it but not shifted into the view:
 * a panel being edited stays where it was as it grows or shrinks, so the cells under the pointer keep still.
 */
export function frameAt(panel: Panel, origin: Point) {
  const bounds = partsBounds(panel.parts);
  const handle = panel.window ? windowHandleHeight : 0;
  const rect = {
    left: origin.x + bounds.column * pitch - panelPadding,
    top: origin.y + bounds.row * pitch - panelPadding - handle,
    width: (panel.window && panel.parts.length === 0 ? 3 : bounds.columns) * pitch - cellGap + panelPadding * 2,
    height: panel.window?.collapsed ? handle : bounds.rows * pitch - cellGap + panelPadding * 2 + handle
  };

  return { origin, rect };
}

/**
 * `board` with each free panel in `origins` kept where its cell (0, 0) starts there, in a view of `view` size; a
 * panel then partly off screen is shifted back in as `panelFrame` shows it.
 */
export function pinPanels(board: Board, origins: ReadonlyMap<string, Point>, view: { width: number; height: number }) {
  return {
    ...board,
    panels: board.panels.map((panel) => {
      const origin = origins.get(panel.id);
      return origin && (panel.owner === undefined || panel.window?.placed)
        ? { ...panel, at: { x: origin.x / view.width, y: origin.y / view.height } }
        : panel;
    })
  };
}

/**
 * Where a panel owned by a part at `anchor` lies, as `panelFrame` gives it: beside the part (see `besideRect`), inside
 * `view`.
 */
export function ownedFrame(panel: Panel, anchor: Rect, view: { width: number; height: number }) {
  const { rect } = frameAt(panel, { x: 0, y: 0 });
  const size = { width: rect.width, height: rect.height };
  const { x: left, y: top } = besideRect(anchor, size, view);
  const origin = { x: left - rect.left, y: top - rect.top };

  return { origin, rect: { left, top, ...size } };
}

export type Rect = { left: number; top: number; width: number; height: number };

/**
 * Where a box of `size` goes beside `anchor`: to its right, else its left, else below or above it, and always inside
 * `view`. Popups and owned panels go there: over other parts, but never over the part that opened them.
 */
export function besideRect(
  anchor: Rect,
  size: { width: number; height: number },
  view: { width: number; height: number }
) {
  const gap = 10;
  const right = anchor.left + anchor.width;
  const bottom = anchor.top + anchor.height;
  const clampX = (x: number) => Math.max(4, Math.min(view.width - size.width - 4, x));
  const clampY = (y: number) => Math.max(4, Math.min(view.height - size.height - 4, y));
  const middleY = clampY(anchor.top + anchor.height / 2 - size.height / 2);

  if (right + gap + size.width <= view.width) {
    return { x: right + gap, y: middleY };
  }

  if (anchor.left - gap - size.width >= 0) {
    return { x: anchor.left - gap - size.width, y: middleY };
  }

  const x = clampX(anchor.left + anchor.width / 2 - size.width / 2);
  return bottom + gap + size.height <= view.height
    ? { x, y: bottom + gap }
    : { x, y: clampY(anchor.top - gap - size.height) };
}

/** The cell whose top-left corner is nearest to `point`, on a grid whose cell (0, 0) starts at `origin`. */
export function nearestCell(origin: Point, point: Point): Cell {
  return { column: Math.round((point.x - origin.x) / pitch), row: Math.round((point.y - origin.y) / pitch) };
}

/** The span a part dragged by its corner gets after the pointer moved `delta` CSS pixels from `from`. */
export function spanAfter(from: Span, delta: Point): Span {
  return {
    columns: clampSpan(from.columns + Math.round(delta.x / pitch)),
    rows: clampSpan(from.rows + Math.round(delta.y / pitch))
  };
}

/** `board` with `panel` replaced by `next`, or removed when `next` has no parts left and no window handle. */
export function replacePanel(board: Board, id: string, next: Panel): Board {
  return {
    ...board,
    panels: board.panels.flatMap((panel) =>
      panel.id !== id ? [panel] : next.parts.length > 0 || next.window ? [next] : []
    )
  };
}

/** `board` with `next` in place of the panel of its id, or added after the others; an empty panel without a handle goes. */
export function putPanel(board: Board, next: Panel): Board {
  if (board.panels.some((panel) => panel.id === next.id)) {
    return replacePanel(board, next.id, next);
  }

  return next.parts.length > 0 || next.window ? { ...board, panels: [...board.panels, next] } : board;
}

/**
 * Puts `block`, parts laid out together such as a kit's, among `parts` with the block's top-left at `cell`. The parts
 * in its way are pushed aside as by one part covering the block's bounds, so the block keeps its layout.
 */
export function placeBlock(parts: readonly Part[], block: readonly Part[], cell: Cell) {
  const bounds = partsBounds(block);
  const standIn = { id: 'block-stand-in', kind: 'block', cell, span: { columns: bounds.columns, rows: bounds.rows } };

  return placePart(parts, standIn).flatMap((part) =>
    part.id !== standIn.id
      ? [part]
      : block.map((inBlock) => ({
          ...inBlock,
          cell: {
            column: cell.column + inBlock.cell.column - bounds.column,
            row: cell.row + inBlock.cell.row - bounds.row
          }
        }))
  );
}

/** The panel part `owner` opens, if it has one. */
export function ownedPanel(board: Board, owner: string) {
  return board.panels.find((panel) => panel.owner === owner);
}

/** `board` without the panels of parts no longer on it, nor the panels of parts on those. */
export function pruneOwned(board: Board): Board {
  let current = board;
  for (;;) {
    const parts = new Set(current.panels.flatMap((panel) => panel.parts.map((part) => part.id)));
    const kept = current.panels.filter((panel) => panel.owner === undefined || parts.has(panel.owner));
    if (kept.length === current.panels.length) {
      return current;
    }

    current = { ...current, panels: kept };
  }
}

/** `board` without part `id`; an empty panel without a window handle goes too. */
export function removePart(board: Board, id: string): Board {
  return {
    ...board,
    panels: board.panels.flatMap((panel) => {
      const parts = panel.parts.filter((part) => part.id !== id);
      return parts.length === 0 && !panel.window
        ? []
        : [parts.length === panel.parts.length ? panel : { ...panel, parts }];
    })
  };
}

/** The part `id` and the panel it lies on, if any. */
export function findPart(board: Board, id: string) {
  for (const panel of board.panels) {
    const part = panel.parts.find((candidate) => candidate.id === id);
    if (part) {
      return { panel, part };
    }
  }

  return undefined;
}

/** A fresh id for a new panel or part. */
export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function bandsMeet(start: number, length: number, otherStart: number, otherLength: number) {
  return start < otherStart + otherLength && otherStart < start + length;
}

function overlaps(a: Part, b: Part) {
  return (
    a.cell.column < b.cell.column + b.span.columns &&
    b.cell.column < a.cell.column + a.span.columns &&
    a.cell.row < b.cell.row + b.span.rows &&
    b.cell.row < a.cell.row + a.span.rows
  );
}

/** The way `part` gets clear of `pusher` by fewer cells: right or down, right on a tie. */
export function shorterWay(part: Part, pusher: Part): Direction {
  const right = pushedCell(part, pusher, 'right').column - part.cell.column;
  const down = pushedCell(part, pusher, 'down').row - part.cell.row;
  return down < right ? 'down' : 'right';
}

/** Where `part` lands when pushed just clear of `pusher` toward `direction`. */
function pushedCell(part: Part, pusher: Part, direction: Direction): Cell {
  switch (direction) {
    case 'right':
      return { ...part.cell, column: pusher.cell.column + pusher.span.columns };
    case 'down':
      return { ...part.cell, row: pusher.cell.row + pusher.span.rows };
  }
}

function clampSpan(value: number) {
  return Math.max(1, Math.min(maxSpan, Math.round(value)));
}
