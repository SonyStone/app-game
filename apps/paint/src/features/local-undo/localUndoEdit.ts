import { TILE_SIZE } from '@app-game/paint-core/brush';
import { defineDocumentEdit, type DocumentEditContext } from '@app-game/paint-core/composition/documentEdit';
import type { TileChange } from '@app-game/paint-core/document';
import { createRegionHistory, type RegionPart } from '@app-game/paint-core/regionHistory';
import {
  combineSelections,
  coverageAt,
  emptySelection,
  expandSelection,
  isSelected,
  polygonSelection,
  selectionBounds,
  strokeSelection,
  type SelectionMask
} from '@app-game/paint-core/selectionMask';
import { z } from 'zod';

/**
 * The engine half of the local undo: returns part of the active layer to an earlier state, leaving the rest of the
 * drawing alone, where Undo undoes the latest step everywhere. A session marks a region with brush dabs or lasso
 * outlines and shows it as it was before the `depth`-th newest step that touched it (see `createRegionHistory`), or
 * collects taps, each removing the newest step that changed the pixel under it, deeper with every tap on the same
 * place. The region belongs to the session alone; the document's selection stays as it was.
 *
 * The canvas shows the result with `context.preview` while the document stays unchanged; `apply` commits it as one
 * ordinary undo step, which Undo reverts and later sessions count like any other, and `cancel` drops it. The preview
 * describes the document it was made for, so a session ends by itself when anything else changes the document (its
 * `revision`), as the runtime then drops the preview; its next command starts a new session, and `apply` fails.
 *
 * It returns pixels, not strokes: everything painted in the region after the chosen step returns too. The history
 * keeps tiles, not pen input, so removing an old stroke while keeping newer ones over it would need the strokes
 * redrawn from recorded input instead. Only the undo history is reachable and only the active layer changes; regions
 * are limited to {@link maxLocalUndoSide} pixels per side, as the fill is. Runs in the drawing engine's realm.
 */
export const localUndoEdit = defineDocumentEdit({
  id: 'local-undo',
  parse: (input: unknown) => localUndoCommandSchema.parse(input),
  async run(context, command): Promise<{ changes: TileChange[]; reply?: LocalUndoReply }> {
    const stored = context.state.get() as Session | undefined;
    const current = stored?.revision === context.revision ? stored : undefined;
    if (command.type === 'cancel' || command.type === 'apply') {
      context.state.set(undefined);
      context.preview.clear();
      if (command.type === 'cancel' || !current) {
        if (command.type === 'apply' && stored) {
          throw new Error('The drawing changed before the local undo was applied. Mark the area again.');
        }

        return { changes: [] };
      }

      return {
        changes: [...current.shown].map(([key, after]) => ({
          layerId: current.layerId,
          key,
          before: context.active.tiles.get(key),
          after
        }))
      };
    }

    if (!context.active.visible) {
      throw new Error('Show the active layer before undoing part of it.');
    }

    let session: Session, reply: Shown;
    if (command.type === 'tap') {
      const taps = current?.kind === 'taps' ? current : { ...start(context), kind: 'taps' as const, parts: [] };
      reply = await tap(context, taps, command.point);
      session = taps;
    } else {
      const marked =
        current?.kind === 'region'
          ? current
          : {
              ...start(context),
              kind: 'region' as const,
              region: emptySelection,
              depth: 1,
              touching: [],
              returned: undefined
            };
      reply = await mark(context, marked, command);
      session = marked;
    }

    context.state.set(session);
    context.preview.show([...session.shown].map(([key, pixels]) => ({ layerId: session.layerId, key, pixels })));
    return { changes: [], reply: { ...reply, revision: session.revision } };
  }
});

/** A local undo command; see {@link localUndoEdit}. */
export type LocalUndoCommand = z.infer<typeof localUndoCommandSchema>;

/**
 * What a command shows: for a marked region, the step it returns to, `depth` of the `count` steps that touched it,
 * 0 when none did; for taps, how many steps they removed and whether the latest tap found one. `outline` shows where
 * the session works. The session belongs to the document at `revision` (see `DocumentEditContext.revision`) and ends
 * when that changes.
 */
export type LocalUndoReply = Shown & { revision: number };

/** What the preview of a session shows; see {@link LocalUndoReply}. */
type Shown = (
  | { kind: 'region'; depth: number; count: number }
  | { kind: 'taps'; removed: number; found: boolean }
) & { outline: RegionOutline | undefined };

/**
 * A coarse picture of a region for drawing its outline over the canvas: `cells` holds the largest coverage, 0 to 255,
 * of each `scale` × `scale` block of document pixels, row by row, `width` blocks wide, starting at `left`, `top`.
 */
export type RegionOutline = {
  left: number;
  top: number;
  scale: number;
  width: number;
  height: number;
  cells: Uint8Array;
};

/** Longest side, in document pixels, of a region the local undo works on. */
export const maxLocalUndoSide = 4096;

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
/** How many steps back a region returns: the depth-th newest step that touched it. */
const depth = z.number().int().min(1).max(1000);
const localUndoCommandSchema = z.discriminatedUnion('type', [
  /**
   * Adds brush dabs along `points` to the region, or with `erase` removes them from it; see `strokeSelection`.
   * Successive parts of one stroke repeat the previous part's last point.
   */
  z.object({
    type: z.literal('brush'),
    points: z
      .array(z.object({ x: z.number().finite(), y: z.number().finite(), radius: z.number().min(0).max(5000) }))
      .min(1)
      .max(20000),
    hardness: z.number().min(0).max(1),
    erase: z.boolean(),
    depth
  }),
  /** Replaces the region with the closed outline `points`, or adds it or subtracts it. */
  z.object({
    type: z.literal('lasso'),
    points: z.array(point).min(3).max(20000),
    mode: z.enum(['replace', 'add', 'subtract']),
    depth
  }),
  /** Shows the region as it was before another step. */
  z.object({ type: z.literal('depth'), depth }),
  /** Removes the newest step that changed the pixel at `point` and is older than the steps removed there already. */
  z.object({ type: z.literal('tap'), point }),
  /** Commits what the session shows as one undo step. */
  z.object({ type: z.literal('apply') }),
  /** Ends the session without changes. */
  z.object({ type: z.literal('cancel') })
]);

/** An open local undo session on one layer and what its preview shows. */
type Session = {
  layerId: string;
  /** The document revision the session was made for; the session is over once that changes. */
  revision: number;
  history: ReturnType<typeof createRegionHistory>;
  /** The tiles the preview replaces and their pixels, `undefined` for transparent; also the result `apply` commits. */
  shown: Map<string, Uint8Array | undefined>;
} & (
  | {
      kind: 'region';
      region: SelectionMask;
      depth: number;
      /** Depths of the steps that touch the region, newest first. */
      touching: number[];
      /** The depth the preview returns to, if any. */
      returned: number | undefined;
    }
  | {
      kind: 'taps';
      /** Each tap's step and the pixels it changed, grown by a pixel. */
      parts: RegionPart[];
    }
);

/** What every new session starts with, on the active layer. */
function start(context: DocumentEditContext) {
  return {
    layerId: context.active.id,
    revision: context.revision,
    history: createRegionHistory(context.readTile),
    shown: new Map<string, Uint8Array | undefined>()
  };
}

/**
 * Changes a marked region or its depth, updates the steps touching it and the preview. All the touching steps are
 * found, not only down to `depth`, so that the panel can tell how many there are. A brush stroke arrives in parts once
 * a frame and only grows the region, so a grown region keeps the steps touching it and checks the others only in the
 * tiles it gained, and while it returns to the same step, only those tiles of the preview are computed again.
 */
async function mark(
  context: DocumentEditContext,
  session: Extract<Session, { kind: 'region' }>,
  command: Extract<LocalUndoCommand, { type: 'brush' | 'lasso' | 'depth' }>
): Promise<Shown> {
  const history = context.history;
  let added: SelectionMask | undefined;
  if (command.type !== 'depth') {
    const shape =
      command.type === 'brush' ? strokeSelection(command.points, command.hardness) : polygonSelection(command.points);
    const mode = command.type === 'brush' ? (command.erase ? 'subtract' : 'add') : command.mode;
    const region = combineSelections(session.region, shape, mode);
    checkSize(region);
    // A region that only grew keeps the steps touching it; others are checked where it grew.
    if (mode === 'add' && isSelected(session.region)) {
      const keys = new Set(shape.tiles.keys());
      const touching = new Set(session.touching);
      for (const [depth, step] of history.entries()) {
        if (!touching.has(depth) && (await session.history.touches(step, session.layerId, region, keys))) {
          touching.add(depth);
        }
      }

      session.touching = [...touching].sort((a, b) => a - b);
      added = shape;
    } else {
      session.touching = await session.history.touching(history, session.layerId, region);
    }

    session.region = region;
  }

  session.depth = command.depth;
  const chosen = Math.min(session.depth, session.touching.length);
  const returned = chosen > 0 ? session.touching[chosen - 1] : undefined;
  // The same step only needs the tiles that the region gained.
  const keys = returned === session.returned && added ? new Set(added.tiles.keys()) : undefined;
  const past =
    returned === undefined
      ? new Map<string, Uint8Array | undefined>()
      : await session.history.past(history, context.active, [{ region: session.region, depth: returned }], keys);
  if (keys) {
    for (const key of keys) {
      session.shown.delete(key);
    }

    for (const [key, pixels] of past) {
      session.shown.set(key, pixels);
    }
  } else {
    session.shown = past;
  }

  session.returned = returned;
  return { kind: 'region', depth: chosen, count: session.touching.length, outline: outline(session.region) };
}

/**
 * Removes, at `point`, the newest step that changed its pixel and is older than every step the session already
 * returns to there, so that a tap removes what the preview shows under it: another tap anywhere on a removed stroke
 * goes deeper, with no distance threshold to tell a repeated tap.
 *
 * A tap undoes a stroke, and the history keeps a stroke as the pixels its step changed, not as a shape, so the step
 * goes as a whole: its part is every pixel it changed, grown by one to take the antialiased edge along. Within that
 * part, everything painted after the step returns too, as in a marked region.
 */
async function tap(
  context: DocumentEditContext,
  session: Extract<Session, { kind: 'taps' }>,
  point: { x: number; y: number }
): Promise<Shown> {
  const history = context.history;
  const covering = session.parts
    .filter(({ region }) => coverageAt(region, point.x, point.y) > 0)
    .reduce((deepest, { depth }) => Math.max(deepest, depth), -1);
  let found: number | undefined;
  for (let depth = covering + 1; depth < history.length && found === undefined; depth++) {
    if (await session.history.changedAt(history[depth]!, session.layerId, point)) {
      found = depth;
    }
  }

  if (found !== undefined) {
    const region = expandSelection(await session.history.changedRegion(history[found]!, session.layerId), 1);
    checkSize(region);
    session.parts.push({ region, depth: found });
    const keys = new Set(region.tiles.keys());
    const past = await session.history.past(history, context.active, session.parts, keys);
    for (const key of keys) {
      session.shown.delete(key);
    }

    for (const [key, pixels] of past) {
      session.shown.set(key, pixels);
    }
  }

  const union = session.parts.reduce((all, { region }) => combineSelections(all, region, 'add'), emptySelection);
  return { kind: 'taps', removed: session.parts.length, found: found !== undefined, outline: outline(union) };
}

/** Refuses a region larger than {@link maxLocalUndoSide} on a side. */
function checkSize(region: SelectionMask) {
  const bounds = selectionBounds(region);
  if (bounds && (bounds.right - bounds.left > maxLocalUndoSide || bounds.bottom - bounds.top > maxLocalUndoSide)) {
    throw new Error(`This area is too large for local undo. Keep it within ${maxLocalUndoSide} px on each side.`);
  }
}

/** The region's coarse picture, at most about {@link outlineCells} blocks on its longer side. */
function outline(region: SelectionMask): RegionOutline | undefined {
  const bounds = selectionBounds(region);
  if (!bounds) {
    return undefined;
  }

  // A power of two, so that blocks never straddle tiles.
  let scale = 1;
  while (Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top) / scale > outlineCells) {
    scale *= 2;
  }

  const left = Math.floor(bounds.left / scale) * scale,
    top = Math.floor(bounds.top / scale) * scale;
  const width = Math.ceil((bounds.right - left) / scale),
    height = Math.ceil((bounds.bottom - top) / scale);
  const cells = new Uint8Array(width * height);
  for (const [key, tile] of region.tiles) {
    const [tx, ty] = key.split(',').map(Number) as [number, number];
    for (let y = 0; y < TILE_SIZE; y++) {
      const row = Math.floor((ty * TILE_SIZE + y - top) / scale);
      for (let x = 0; x < TILE_SIZE; x++) {
        const value = tile[y * TILE_SIZE + x]!;
        if (!value) {
          continue;
        }

        const cell = row * width + Math.floor((tx * TILE_SIZE + x - left) / scale);
        cells[cell] = Math.max(cells[cell]!, value);
      }
    }
  }

  return { left, top, scale, width, height, cells };
}

/** Blocks on the longer side of a region's outline at most. */
const outlineCells = 512;
