import { findPart, replacePanel, type Board, type Part, type Span } from './board';
import type { Room } from './grid';

/**
 * Looks: one part, many ways to show it. A part's kind says what it does (the color); a look says how it shows at a
 * size (a swatch, the Zen disc, the Coolorus wheel…). The user picks a look for the size the part has, like choosing
 * among Android's layouts for a widget's size, and the part remembers the choice for that size.
 */

/**
 * A look a part can take: `min` is the smallest room in CSS pixels it fits, whatever the cell size, and `fits` decides
 * for looks that fit more shapes than every room from `min` up, such as a slider, which needs length along either
 * side.
 */
export type LookSpec = { id: string; label: string; min: Room; fits?: (room: Room) => boolean };

/** The `min` of a look that fits any part, one cell or more. */
export const anyRoom: Room = { width: 0, height: 0 };

/** The key a look chosen at `span` is kept under in `Part.looks`. */
export function spanKey(span: Span) {
  return `${span.columns}x${span.rows}`;
}

/** Whether `look` fits a part with `room`. */
export function lookFits(look: LookSpec, room: Room) {
  return look.fits ? look.fits(room) : look.min.width <= room.width && look.min.height <= room.height;
}

/** Whether a part of `span` covers `at` both ways. */
function covers(span: Span, at: Span) {
  return at.columns <= span.columns && at.rows <= span.rows;
}

/**
 * The look a part of `span` with `room` shows. Of the looks chosen at sizes up to `span` both ways that still fit its
 * room, the one chosen at the largest size wins, as Android shows a widget's largest layout its size admits: a look
 * chosen at 2×2 also shows at 3×3 until something else is chosen there. Without such a choice the part shows `auto`.
 */
export function resolveLook(chosen: Part['looks'], span: Span, looks: readonly LookSpec[], auto: string, room: Room) {
  let best: { id: string; area: number; columns: number } | undefined;

  for (const [key, id] of Object.entries(chosen ?? {})) {
    const at = parseSpanKey(key);
    const look = looks.find((candidate) => candidate.id === id);
    if (!at || !look || !covers(span, at) || !lookFits(look, room)) {
      continue;
    }

    const area = at.columns * at.rows;
    if (!best || area > best.area || (area === best.area && at.columns > best.columns)) {
      best = { id, area, columns: at.columns };
    }
  }

  return best?.id ?? auto;
}

/**
 * `board` with part `id` showing `look` at `span`; `undefined` forgets the choice at that size, so the part falls
 * back to a smaller size's choice or the automatic look.
 */
export function chooseLook(board: Board, id: string, span: Span, look: string | undefined): Board {
  return updatePart(board, id, (part) => {
    const others = lookChoicesBut(part.looks, span);
    const looks = look === undefined ? others : { ...others, [spanKey(span)]: look };
    return { ...part, looks: Object.keys(looks).length > 0 ? looks : undefined };
  });
}

/** The looks chosen at sizes other than `span`. */
export function lookChoicesBut(chosen: Part['looks'], span: Span) {
  return Object.fromEntries(Object.entries(chosen ?? {}).filter(([key]) => key !== spanKey(span)));
}

function updatePart(board: Board, id: string, change: (part: Part) => Part): Board {
  const found = findPart(board, id);
  if (!found) {
    return board;
  }

  const parts = found.panel.parts.map((part) => (part.id === id ? change(part) : part));
  return replacePanel(board, found.panel.id, { ...found.panel, parts });
}

function parseSpanKey(key: string): Span | undefined {
  const match = /^(\d+)x(\d+)$/.exec(key);
  return match ? { columns: Number(match[1]), rows: Number(match[2]) } : undefined;
}
