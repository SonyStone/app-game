import { partsBounds, type Part, type Rect } from './board';

/**
 * Fusing: neighbouring parts of one group (`PartGroup`) on a plate draw as one block, their fill reaching across the
 * gap to a thin seam and their corners at the seam square. The grid and the parts' cells never change; only how a
 * part draws its edge does, from the four flags `partJoins` derives here.
 *
 * A side of a part fuses only when everything across it belongs to the part's group and covers the whole side, and
 * each of those neighbours' facing sides fuses in turn. So parts of different sizes fuse when one's side lies wholly
 * against the other's: a three-cell part over three one-cell parts of its group fuses with all three, while a part
 * whose side lies only partly against a related neighbour (the rest against a gap or an unrelated part) keeps the
 * ordinary gap on that whole side, and so does the neighbour. A seam is then always between two parts that both
 * reach across to it.
 */

/** A side of a part. */
export type Side = 'top' | 'right' | 'bottom' | 'left';

/** The sides along which a part fuses with its neighbours. */
export type Joins = Readonly<Record<Side, boolean>>;

/** The sides in the order `joinsAttribute` lists them. */
export const sides: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/**
 * The sides each of `parts` fuses along, by part id, for the parts lying together on one plate; parts with no fused
 * side are left out. `groupOf` names a kind's group, `undefined` for a kind that fuses with nothing (unknown or
 * broken parts). Pure and proportional to the square of the plate's parts, it runs when a plate's parts change, never
 * per frame.
 */
export function partJoins(parts: readonly Part[], groupOf: (kind: string) => string | undefined) {
  const groups = new Map(parts.map((part) => [part.id, groupOf(part.kind)]));
  const across = new Map(parts.map((part) => [part.id, neighbours(part, parts)]));
  const joined = new Map<string, Record<Side, boolean>>();

  for (const part of parts) {
    const group = groups.get(part.id);
    const flags = { top: false, right: false, bottom: false, left: false };

    for (const side of sides) {
      const found = across.get(part.id)![side];
      const covered = found.reduce((sum, entry) => sum + entry.overlap, 0) === sideLength(part, side);
      flags[side] = group !== undefined && covered && found.every((entry) => groups.get(entry.part.id) === group);
    }

    joined.set(part.id, flags);
  }

  // A side stays fused only while every neighbour across it fuses back; dropping one side can drop others.
  for (let changed = true; changed; ) {
    changed = false;

    for (const part of parts) {
      const flags = joined.get(part.id)!;

      for (const side of sides) {
        if (flags[side] && across.get(part.id)![side].some((entry) => !joined.get(entry.part.id)![opposite[side]])) {
          flags[side] = false;
          changed = true;
        }
      }
    }
  }

  const result = new Map<string, Joins>();
  for (const [id, flags] of joined) {
    if (sides.some((side) => flags[side])) {
      result.set(id, flags);
    }
  }

  return result;
}

/**
 * The sides of the view a panel lies flush against, as `panelFrame` pushes a panel that would leave the view. A plate
 * there is concentric with the screen's edge: the edge runs straight on, so the plate's corners on that side are
 * square, and so are those of the parts lying along that side of the plate, by the same nesting.
 */
export function panelEdges(rect: Rect, view: { width: number; height: number }): Joins {
  return {
    top: rect.top <= edgeSlack,
    right: rect.left + rect.width >= view.width - edgeSlack,
    bottom: rect.top + rect.height >= view.height - edgeSlack,
    left: rect.left <= edgeSlack
  };
}

/**
 * The sides of `part` that lie along a side of its panel the panel has flush against the view (`edges`), so that its
 * corners there are square as the plate's are. A floating panel's grip lies above its parts, so its top parts keep
 * their top corners.
 */
export function partEdges(part: Part, parts: readonly Part[], edges: Joins, floating = false): Joins {
  const bounds = partsBounds(parts);
  return {
    top: edges.top && !floating && part.cell.row === bounds.row,
    right: edges.right && part.cell.column + part.span.columns === bounds.column + bounds.columns,
    bottom: edges.bottom && part.cell.row + part.span.rows === bounds.row + bounds.rows,
    left: edges.left && part.cell.column === bounds.column
  };
}

/** How near a view's side, in CSS pixels, a panel counts as flush against it. */
const edgeSlack = 0.5;

/** `joins` as the space-separated list of fused sides a part's `data-joins` attribute holds; `undefined` for none. */
export function joinsAttribute(joins: Joins | undefined) {
  const list = sides.filter((side) => joins?.[side]);
  return list.length > 0 ? list.join(' ') : undefined;
}

/**
 * Whether `a` and `b` are the same parts of the same kinds on the same cells, in order: what `partJoins` reads, so a
 * caller recomputes the joins only when it is false, as when a drag moves a part to another cell.
 */
export function sameCells(a: readonly Part[], b: readonly Part[]) {
  return (
    a.length === b.length &&
    a.every((part, index) => {
      const other = b[index]!;
      return (
        part.id === other.id &&
        part.kind === other.kind &&
        part.cell.column === other.cell.column &&
        part.cell.row === other.cell.row &&
        part.span.columns === other.span.columns &&
        part.span.rows === other.span.rows
      );
    })
  );
}

const opposite: Record<Side, Side> = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' };

/** The parts whose facing edge lies on the cell line next to each side of `part`, with the cells they share. */
function neighbours(part: Part, parts: readonly Part[]) {
  const found: Record<Side, { part: Part; overlap: number }[]> = { top: [], right: [], bottom: [], left: [] };

  for (const other of parts) {
    if (other.id === part.id) {
      continue;
    }

    const columns = shared(part.cell.column, part.span.columns, other.cell.column, other.span.columns);
    const rows = shared(part.cell.row, part.span.rows, other.cell.row, other.span.rows);

    if (columns > 0 && other.cell.row + other.span.rows === part.cell.row) {
      found.top.push({ part: other, overlap: columns });
    } else if (columns > 0 && part.cell.row + part.span.rows === other.cell.row) {
      found.bottom.push({ part: other, overlap: columns });
    } else if (rows > 0 && other.cell.column + other.span.columns === part.cell.column) {
      found.left.push({ part: other, overlap: rows });
    } else if (rows > 0 && part.cell.column + part.span.columns === other.cell.column) {
      found.right.push({ part: other, overlap: rows });
    }
  }

  return found;
}

/** How many cells two bands starting at `a` and `b` share. */
function shared(a: number, aLength: number, b: number, bLength: number) {
  return Math.max(0, Math.min(a + aLength, b + bLength) - Math.max(a, b));
}

function sideLength(part: Part, side: Side) {
  return side === 'top' || side === 'bottom' ? part.span.columns : part.span.rows;
}
