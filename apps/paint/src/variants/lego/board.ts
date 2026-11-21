import { cellGap, panelPadding } from './grid';
export { cellGap, panelPadding } from './grid';
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

/** Screen edge a panel can dock to, stretching its `stretch: 'rows'` parts to full view height. */
export type DockSide = 'left' | 'right';

/** Resolves whether parts of `kind` stretch along rows when docked or clamp vertically on screen rotation. */
export type StretchResolver = (kind: string) => 'rows' | undefined;

/**
 * A panel lying on the drawing. `at` places its cell (0, 0) as fractions of the view's width and height, so the
 * layout keeps its proportions when the view resizes or turns. Floating panels use their plate's top-left instead.
 * Negative cell indices let a panel grow toward the top and left without moving its parts on screen.
 */
export type Panel = {
  id: string;
  at: Point;
  parts: Part[];
  /** The swatch whose transient folder this is. Floating panels are always free panels. */
  owner?: string;
  /** Screen edge this panel is docked to; its stored `Part.span` stays intact while rendered height adapts to the view. */
  dock?: DockSide;
  /** A movable plate with a top grip. `at` stores its top-left; empty plates survive unless `removeWhenEmpty` is set. */
  floating?: true;
  /** Remove this plate when its last part leaves; absent preserves empty floating plates. */
  removeWhenEmpty?: true;
  /**
   * Where an owned panel lies from its part: its cell (0, 0) this many cells from the part's top-left cell, which may
   * put it over the part. Without it the panel lies beside the part where there is room (see `ownedFrame`).
   */
  offset?: Cell;
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

/** The largest span of a part in either direction. */
export const maxSpan = 36;
/** Height of the grip strip, outside the stud cells. */
export const floatingGripHeight = 8;

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

/** Gap in CSS pixels kept between docked edge sidebars and free panels inside `safeArea`. */
export const dockGap = 8;

/**
 * Derived render layout for `panel` in `view`, without mutating stored `Part.span`:
 * - When `panel.dock` is set, every `stretch: 'rows'` part fills the full available row count for `view.height`.
 * - When undocked, any `stretch: 'rows'` part taller than `view.height` is clamped to fit so portrait→landscape
 *   rotation never clips the panel's top or bottom off screen.
 */
export function dockedLayout(
  pitch: number,
  panel: Panel,
  view: { width: number; height: number },
  stretch: StretchResolver = defaultStretch
): Panel {
  if (panel.parts.length === 0) {
    return panel;
  }

  const handle = panel.floating ? floatingGripHeight : 0;
  const fitRows = Math.max(1, Math.floor((view.height - panelPadding * 2 - handle + cellGap) / pitch));
  const bounds = partsBounds(panel.parts);
  let changed = false;

  const parts = panel.parts.map((part) => {
    if (stretch(part.kind) !== 'rows') {
      return part;
    }

    const otherRows = Math.max(0, bounds.rows - part.span.rows);
    const maxFit = Math.max(1, fitRows - otherRows);
    const nextRows = panel.dock ? maxFit : Math.min(part.span.rows, maxFit);
    if (nextRows === part.span.rows) {
      return part;
    }

    changed = true;
    return { ...part, span: { ...part.span, rows: nextRows } };
  });

  return changed ? { ...panel, parts } : panel;
}

/**
 * Computed edge frames and derived layouts for all docked panels in `board`, stacked inward from `'left'` and
 * `'right'` in board order.
 */
export function dockedFrames(
  pitch: number,
  board: Board,
  view: { width: number; height: number },
  editing = true,
  stretch: StretchResolver = defaultStretch
) {
  const result = new Map<string, { panel: Panel; frame: { origin: Point; rect: Rect } }>();
  let leftInset = 0;
  let rightInset = 0;

  for (const panel of board.panels) {
    if (panel.owner !== undefined || panel.dock === undefined) {
      continue;
    }

    const layout = dockedLayout(pitch, panel, view, stretch);
    const measured = frameAt(pitch, layout, { x: 0, y: 0 }, editing).rect;
    const width = measured.width;
    const height = view.height;
    const left = panel.dock === 'left' ? leftInset : Math.max(0, view.width - rightInset - width);
    const top = 0;
    const origin = { x: left - measured.left, y: top - measured.top };
    result.set(panel.id, { panel: layout, frame: { origin, rect: { left, top, width, height } } });

    if (panel.dock === 'left') {
      leftInset += width + dockGap;
    } else {
      rightInset += width + dockGap;
    }
  }

  return result;
}

/**
 * Viewport rectangle remaining after docked left/right sidebars (plus `dockGap` clearance). Non-docked panels,
 * popups, owned panels, `freeSpot`, and floating bars lay out inside this area without altering stored `at`.
 */
export function safeArea(
  pitch: number,
  board: Board,
  view: { width: number; height: number },
  editing = true,
  stretch: StretchResolver = defaultStretch
): Rect {
  let leftInset = 0;
  let rightInset = 0;

  for (const panel of board.panels) {
    if (panel.owner !== undefined || panel.dock === undefined) {
      continue;
    }

    const layout = dockedLayout(pitch, panel, view, stretch);
    const width = frameAt(pitch, layout, { x: 0, y: 0 }, editing).rect.width;
    if (panel.dock === 'left') {
      leftInset += width + dockGap;
    } else {
      rightInset += width + dockGap;
    }
  }

  return {
    left: leftInset,
    top: 0,
    width: Math.max(0, view.width - leftInset - rightInset),
    height: view.height
  };
}

/** Whether docking `panelId` to `side` still leaves at least `6 * pitch` CSS pixels in `safeArea`. */
export function canDock(
  pitch: number,
  board: Board,
  panelId: string,
  side: DockSide,
  view: { width: number; height: number },
  stretch: StretchResolver = defaultStretch
) {
  const preview: Board = {
    ...board,
    panels: board.panels.map((panel) => (panel.id === panelId ? { ...panel, dock: side } : panel))
  };
  return safeArea(pitch, preview, view, true, stretch).width >= 6 * pitch;
}

/**
 * Where `panel` lies in a view of `view` size, in CSS pixels: `origin` is the top-left of its cell (0, 0) and `rect`
 * its whole box with the padding. A panel partly outside `area` (defaulting to the full view) is shifted back in, so a
 * turned, smaller, or docked-sidebar view never hides parts; its stored `at` is kept. `editing` defaults to true and
 * reserves an empty floating plate's drop area.
 */
export function panelFrame(
  pitch: number,
  panel: Panel,
  view: { width: number; height: number },
  editing = true,
  area?: Rect,
  stretch: StretchResolver = defaultStretch
) {
  const layout = dockedLayout(pitch, panel, view, stretch);
  const bounds = area ?? { left: 0, top: 0, width: view.width, height: view.height };
  const { rect } = frameAt(pitch, layout, { x: 0, y: 0 }, editing);
  const { width, height } = rect;
  const wanted = {
    x: panel.at.x * view.width + (panel.floating ? 0 : rect.left),
    y: panel.at.y * view.height + (panel.floating ? 0 : rect.top)
  };
  const maxLeft = Math.max(bounds.left, bounds.left + bounds.width - width);
  const maxTop = Math.max(bounds.top, bounds.top + bounds.height - height);
  const left = Math.max(bounds.left, Math.min(wanted.x, maxLeft));
  const top = Math.max(bounds.top, Math.min(wanted.y, maxTop));
  const origin = { x: left - rect.left, y: top - rect.top };

  return { origin, rect: { left, top, width, height } };
}

/**
 * Where `panel` lies when its cell (0, 0) starts at `origin`, as `panelFrame` gives it but not shifted into the view:
 * a panel being edited stays where it was as it grows or shrinks, so the cells under the pointer keep still.
 * Empty floating plates reserve a drop area by default; pass `false` for their Live strip alone.
 */
export function frameAt(pitch: number, panel: Panel, origin: Point, editing = true) {
  const bounds = partsBounds(panel.parts);
  const handle = panel.floating ? floatingGripHeight : 0;
  const rect = {
    left: origin.x + bounds.column * pitch - panelPadding,
    top: origin.y + bounds.row * pitch - panelPadding - handle,
    width: (panel.floating && panel.parts.length === 0 ? 3 : bounds.columns) * pitch - cellGap + panelPadding * 2,
    height:
      panel.floating && panel.parts.length === 0 && !editing
        ? panelPadding + handle
        : bounds.rows * pitch - cellGap + handle + panelPadding * 2
  };

  return { origin, rect };
}

/**
 * `board` with each free panel in `origins` kept where its cell (0, 0) starts there, in a view of `view` size; a
 * panel then partly off screen is shifted back in as `panelFrame` shows it.
 */
export function pinPanels(
  pitch: number,
  board: Board,
  origins: ReadonlyMap<string, Point>,
  view: { width: number; height: number }
) {
  return {
    ...board,
    panels: board.panels.map((panel) => {
      const origin = origins.get(panel.id);
      if (!origin || panel.owner !== undefined) {
        return panel;
      }

      const rect = frameAt(pitch, panel, origin).rect;
      return {
        ...panel,
        at: {
          x: (panel.floating ? rect.left : origin.x) / view.width,
          y: (panel.floating ? rect.top : origin.y) / view.height
        }
      };
    })
  };
}

/**
 * Where a panel owned by a part at `anchor` lies, as `panelFrame` gives it: beside the part (see `besideRect`), inside
 * `area` (or full `view`).
 */
export function ownedFrame(
  pitch: number,
  panel: Panel,
  anchor: Rect,
  view: { width: number; height: number },
  area?: Rect
) {
  const { rect } = frameAt(pitch, panel, { x: 0, y: 0 });
  const size = { width: rect.width, height: rect.height };
  const { x: left, y: top } = besideRect(anchor, size, view, area);
  const origin = { x: left - rect.left, y: top - rect.top };

  return { origin, rect: { left, top, ...size } };
}

export type Rect = { left: number; top: number; width: number; height: number };

/**
 * Where a box of `size` goes beside `anchor`: to its right, else its left, else below or above it, and always inside
 * `area` (defaulting to `view`). Popups and owned panels go there: over other parts, but never over the part that
 * opened them.
 */
export function besideRect(
  anchor: Rect,
  size: { width: number; height: number },
  view: { width: number; height: number },
  area?: Rect
) {
  const gap = 10;
  const bounds = area ?? { left: 0, top: 0, width: view.width, height: view.height };
  const boundsRight = bounds.left + bounds.width;
  const boundsBottom = bounds.top + bounds.height;
  const right = anchor.left + anchor.width;
  const bottom = anchor.top + anchor.height;
  const clampX = (x: number) =>
    Math.max(bounds.left + 4, Math.min(Math.max(bounds.left + 4, boundsRight - size.width - 4), x));
  const clampY = (y: number) =>
    Math.max(bounds.top + 4, Math.min(Math.max(bounds.top + 4, boundsBottom - size.height - 4), y));
  const middleY = clampY(anchor.top + anchor.height / 2 - size.height / 2);

  if (right + gap + size.width <= boundsRight) {
    return { x: Math.max(bounds.left + 4, right + gap), y: middleY };
  }

  if (anchor.left - gap - size.width >= bounds.left) {
    return { x: Math.min(boundsRight - size.width - 4, anchor.left - gap - size.width), y: middleY };
  }

  const x = clampX(anchor.left + anchor.width / 2 - size.width / 2);
  return bottom + gap + size.height <= boundsBottom
    ? { x, y: Math.max(bounds.top + 4, bottom + gap) }
    : { x, y: clampY(anchor.top - gap - size.height) };
}

/**
 * Where a new panel holding one part of `span` can lie in `safeArea` without touching the board's other panels: the
 * first place, row by row from the top left in steps of half a cell, whose plate keeps `margin` CSS pixels clear of
 * every free panel's plate and of `safeArea`'s edges. Owned panels are left out, as they come and go. Returns the
 * panel's `at`, as fractions of the view; the safe area's top left corner when no place is free.
 */
export function freeSpot(
  pitch: number,
  board: Board,
  view: { width: number; height: number },
  span: Span,
  margin = 16,
  stretch: StretchResolver = defaultStretch
): Point {
  const width = span.columns * pitch - cellGap + panelPadding * 2;
  const height = span.rows * pitch - cellGap + panelPadding * 2;
  const area = safeArea(pitch, board, view, false, stretch);
  const docked = dockedFrames(pitch, board, view, false, stretch);
  const taken = board.panels
    .filter((panel) => panel.owner === undefined)
    .map((panel) => docked.get(panel.id)?.frame.rect ?? panelFrame(pitch, panel, view, false, area, stretch).rect);
  const at = (left: number, top: number) => ({
    x: (left + panelPadding) / view.width,
    y: (top + panelPadding) / view.height
  });

  const maxTop = area.top + area.height - height - margin;
  const maxLeft = area.left + area.width - width - margin;
  for (let top = area.top + margin; top <= maxTop; top += pitch / 2) {
    for (let left = area.left + margin; left <= maxLeft; left += pitch / 2) {
      const clear = taken.every(
        (rect) =>
          left + width + margin <= rect.left ||
          rect.left + rect.width + margin <= left ||
          top + height + margin <= rect.top ||
          rect.top + rect.height + margin <= top
      );
      if (clear) {
        return at(left, top);
      }
    }
  }

  return at(area.left + margin, area.top + margin);
}

/** The cell whose top-left corner is nearest to `point`, on a grid whose cell (0, 0) starts at `origin`. */
export function nearestCell(pitch: number, origin: Point, point: Point): Cell {
  return { column: Math.round((point.x - origin.x) / pitch), row: Math.round((point.y - origin.y) / pitch) };
}

/** The span a part dragged by its corner gets after the pointer moved `delta` CSS pixels from `from`. */
export function spanAfter(pitch: number, from: Span, delta: Point): Span {
  return {
    columns: clampSpan(from.columns + Math.round(delta.x / pitch)),
    rows: clampSpan(from.rows + Math.round(delta.y / pitch))
  };
}

/** `board` with `panel` replaced by `next`, or removed when `next` has no parts left and no grip strip. */
export function replacePanel(board: Board, id: string, next: Panel): Board {
  return {
    ...board,
    panels: board.panels.flatMap((panel) =>
      panel.id !== id ? [panel] : next.parts.length > 0 || (next.floating && !next.removeWhenEmpty) ? [next] : []
    )
  };
}

/** `board` with `next` in place of the panel of its id, or added after the others; an empty panel without a handle goes. */
export function putPanel(board: Board, next: Panel): Board {
  if (board.panels.some((panel) => panel.id === next.id)) {
    return replacePanel(board, next.id, next);
  }

  return next.parts.length > 0 || next.floating ? { ...board, panels: [...board.panels, next] } : board;
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

/** `board` without part `id`; an empty panel without a grip strip goes too. */
export function removePart(board: Board, id: string): Board {
  return {
    ...board,
    panels: board.panels.flatMap((panel) => {
      const parts = panel.parts.filter((part) => part.id !== id);
      return parts.length === 0 && (!panel.floating || panel.removeWhenEmpty)
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

/** Built-in fallback stretch lookup for pure callers that do not pass `partStretch`. */
const defaultStretch: StretchResolver = (kind) =>
  kind === 'layers:strip' || kind === 'layers:list' ? 'rows' : undefined;
