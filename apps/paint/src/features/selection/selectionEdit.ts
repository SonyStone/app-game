import { defineDocumentEdit, type DocumentEditContext } from '@app-game/paint-core/composition/documentEdit';
import {
  areaSelection,
  combineSelections,
  emptySelection,
  featherSelection,
  invertSelection,
  polygonSelection,
  translateSelection,
  wholeSelection,
  type SelectionMask
} from '@app-game/paint-core/selectionMask';
import { z } from 'zod';
import { colorMask, floodMask, smoothMask } from '../../shared/floodFill';
import { areaAround, reachesLimit, sampleArea } from '../../shared/sampleArea';

/**
 * The engine half of the selection tools: changes the engine's selection, which brushes, fills, gradients, transforms
 * and pixel commands then stay inside. A drawn `shape` (lasso, polygon, rectangle or ellipse outline) or a magic
 * `wand` region combines with the selection by its mode; `all`, `clear`, `invert`, `feather` and `translate` change
 * it as a whole. Selection changes are not undo steps, as the selection outlasts history. Runs in the drawing engine's
 * realm.
 */
export const selectionEdit = defineDocumentEdit({
  id: 'select',
  parse: (input: unknown) => selectionCommandSchema.parse(input),
  async run(context, command) {
    return { changes: [], selection: await selected(context, command) };
  }
});

/** A selection command; see {@link selectionEdit}. */
export type SelectionCommand = z.infer<typeof selectionCommandSchema>;

/** Longest side of the area a magic wand examines around its point. */
export const maxWandSide = 4096;

/** Largest feather radius, in document pixels. */
export const maxFeatherRadius = 250;

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const mode = z.enum(['replace', 'add', 'subtract', 'intersect']);
const selectionCommandSchema = z.discriminatedUnion('op', [
  /** A closed outline in document pixels; pixels whose centers lie inside it by the even-odd rule. */
  z.object({ op: z.literal('shape'), points: z.array(point).min(3).max(4096), mode }),
  /**
   * The pixels of a color similar to the one at `point`: connected to it (`contiguous`) or anywhere in `area`, the
   * view's bounds in document pixels, compared on the active layer or on all visible layers composited.
   */
  z.object({
    op: z.literal('wand'),
    point,
    area: z.object({
      left: z.number().finite(),
      top: z.number().finite(),
      width: z.number().finite().nonnegative(),
      height: z.number().finite().nonnegative()
    }),
    /** Largest per-channel difference from the clicked pixel that still counts as the same color, 0–255. */
    tolerance: z.number().int().min(0).max(255),
    contiguous: z.boolean(),
    source: z.enum(['layer', 'all']),
    /** Softens the region's edge by a pixel, as Photoshop's Anti-alias does. */
    antialias: z.boolean(),
    mode
  }),
  z.object({ op: z.literal('all') }),
  z.object({ op: z.literal('clear') }),
  z.object({ op: z.literal('invert') }),
  z.object({ op: z.literal('feather'), radius: z.number().positive().max(maxFeatherRadius) }),
  z.object({ op: z.literal('translate'), offset: point })
]);

/** The selection after `command`. */
async function selected(context: DocumentEditContext, command: SelectionCommand): Promise<SelectionMask> {
  switch (command.op) {
    case 'shape':
      return combineSelections(context.selection, polygonSelection(command.points), command.mode);
    case 'wand':
      return combineSelections(context.selection, await wandSelection(context, command), command.mode);
    case 'all':
      return wholeSelection;
    case 'clear':
      return emptySelection;
    case 'invert':
      return invertSelection(context.selection);
    case 'feather':
      return featherSelection(context.selection, command.radius);
    case 'translate':
      return translateSelection(context.selection, command.offset);
  }
}

/**
 * The magic wand's region: the pixels within the tolerance of the clicked one, as the bucket fill finds them. Throws
 * when a contiguous region would continue past {@link maxWandSide} inside the view.
 */
async function wandSelection(
  context: DocumentEditContext,
  command: Extract<SelectionCommand, { op: 'wand' }>
): Promise<SelectionMask> {
  const seed = { x: Math.floor(command.point.x), y: Math.floor(command.point.y) };
  const area = areaAround(command.area, seed, maxWandSide);
  if (!area) {
    return emptySelection;
  }

  const sampled = await sampleArea(context, area, command.source);
  const mask = command.contiguous
    ? floodMask(area, sampled, seed, command.tolerance)
    : colorMask(area, sampled, seed, command.tolerance);
  if (command.contiguous && reachesLimit(mask, area, command.area)) {
    throw new Error('This area is too large to select at this zoom. Zoom in and try again.');
  }

  // The fill's mask encoding, 1 for full and 2–255 for partial coverage, as selection coverage from 0 to 255.
  const soft = command.antialias ? smoothMask(mask, area.width, area.height) : mask;
  return areaSelection(
    area,
    soft.map((value) => (value === 1 ? 255 : value))
  );
}
