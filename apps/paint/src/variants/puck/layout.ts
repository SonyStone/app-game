/** A point in client CSS pixels. */
export type Point = { x: number; y: number };

/**
 * Places the cluster around the QuickMenu, with the QuickMenu's center as close to `at`, the pen, as the viewport
 * allows. The tools and the brush cards go on the pen hand's side and color and layers on the other side, in three
 * columns (`wide`), or with color and layers stacked with the QuickMenu when the viewport is too narrow (`tall`),
 * above it, below it or one on each side. Near an edge without room for the hand's columns they swap sides, as the
 * Tile Cluster spec asks. Among these arrangements the one that keeps the QuickMenu nearest to the pen wins; scaling
 * the cluster down, which only happens when nothing fits, costs most, and swapping sides costs a little.
 *
 * Side columns slide vertically on their own to stay inside the viewport, so the QuickMenu stays under the pen near
 * the top or the bottom of the screen. Boxes are in unscaled CSS pixels relative to the QuickMenu's center; `center`
 * is in client pixels; `side` is where the tools went.
 */
export function clusterLayout(at: Point, viewport: { width: number; height: number }, hand: Hand) {
  const candidates = arrangements.flatMap((arrangement) =>
    ([hand, other(hand)] as const).map((side) => {
      const placement = place(arrangement, side, at, viewport);
      const distance = Math.hypot(placement.center.x - at.x, placement.center.y - at.y);
      const cost = distance + (1 - placement.scale) * scaleCost + (side === hand ? 0 : swapCost);
      return { ...placement, cost };
    })
  );
  // The first of equal candidates wins: the wide form, the pen hand's side, color above the QuickMenu.
  const best = candidates.reduce((winner, candidate) => (candidate.cost < winner.cost - 0.5 ? candidate : winner));
  return { center: best.center, scale: best.scale, boxes: best.boxes, kind: best.kind, side: best.side };
}

/** The cluster's placement; see `clusterLayout`. */
export type ClusterLayout = ReturnType<typeof clusterLayout>;

/** The hand that holds the pen: the tools and the brush cards go on its side. */
export type Hand = 'left' | 'right';

/** The parts of the cluster, each a card or a control placed on its own. */
export type Part = 'tools' | 'library' | 'studio' | 'sizeBar' | 'ring' | 'opacityBar' | 'view' | 'color' | 'layers';

/** A part's box relative to the QuickMenu's center, in unscaled CSS pixels. */
export type Box = { x: number; y: number; width: number; height: number };

/** A box as inline CSS for an absolutely placed part. */
export function placed(box: Box) {
  return { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px` };
}

/**
 * Sizes of the parts, shared with the components that draw them. The tools pill holds seven 40 px buttons and two
 * dividers; see `.tools` in `cluster.module.css`.
 */
export const sizes = {
  ring: 176,
  capsule: { width: 32, height: 156 },
  view: { width: 216, height: 44 },
  tools: { width: 52, height: toolsHeight(7) },
  // Both side columns are 726 px tall, so that their tops and bottoms line up.
  library: { width: 300, height: 316 },
  /** The settings card: enough for the longest settings, the eraser's and the magic wand's. */
  studio: { width: 300, height: 400 },
  color: { width: 276, height: 384 },
  layers: { width: 276, height: 332 }
} as const;

/** The height of the tools pill with `buttons` buttons, two dividers, 2 px gaps and 6 px of padding at each end. */
function toolsHeight(buttons: number) {
  const items = buttons + 2;
  return buttons * 40 + 2 * 7 + (items - 1) * 2 + 12;
}

/** How much a full scale-down weighs against the QuickMenu's distance from the pen, in pixels. */
const scaleCost = 2000;
/** How far the QuickMenu must come closer to the pen before the columns swap sides, in pixels. */
const swapCost = 80;

/**
 * Places one arrangement, with the tools on `side`: the scale that fits it, the QuickMenu's center as near to `at` as
 * the whole cluster allows horizontally and the QuickMenu with what is stacked with it allows vertically, and the
 * side columns slid into the viewport.
 */
function place(arrangement: Arrangement, side: Hand, at: Point, viewport: { width: number; height: number }) {
  const extent = extentOf(Object.values(arrangement.boxes));
  const tallest = Math.max(
    ...arrangement.columns.map((column) => extentOf(column.map((part) => arrangement.boxes[part])).height),
    extentOf(arrangement.puck.map((part) => arrangement.boxes[part])).height
  );
  const scale = Math.min(1, (viewport.width - margin * 2) / extent.width, (viewport.height - margin * 2) / tallest);
  const boxes = mirrored(arrangement.boxes, side);

  const all = extentOf(Object.values(boxes));
  const puck = extentOf(arrangement.puck.map((part) => boxes[part]));
  const center = {
    x: clamp(at.x, margin - all.x * scale, viewport.width - margin - (all.x + all.width) * scale),
    y: clamp(at.y, margin - puck.y * scale, viewport.height - margin - (puck.y + puck.height) * scale)
  };

  // Each side column slides vertically, as one piece, until it is inside the viewport.
  for (const column of arrangement.columns) {
    const columnExtent = extentOf(column.map((part) => boxes[part]));
    const top = center.y + columnExtent.y * scale;
    const clampedTop = clamp(top, margin, viewport.height - margin - columnExtent.height * scale);
    const shift = (clampedTop - top) / scale;
    for (const part of column) {
      boxes[part] = { ...boxes[part], y: boxes[part].y + shift };
    }
  }

  return { center, scale, boxes, kind: arrangement.kind, side };
}

/** The other hand. */
function other(hand: Hand): Hand {
  return hand === 'left' ? 'right' : 'left';
}

/** Space between neighbouring cards. */
const gap = 10;
/** Space between the QuickMenu with its bars and the columns beside it. */
const blockGap = 14;
/** Space between the bars and the QuickMenu's ring. */
const capsuleGap = 8;
/** Space kept free at the viewport's edges. */
const margin = 10;

/**
 * Lays the parts out with the tools on the left: the wide form has three columns, the tall form stacks color and
 * layers with the QuickMenu, both above it, both below it, or color above and layers below.
 */
function arrange(kind: 'wide' | 'tall', stacking: 'split' | 'above' | 'below' = 'split') {
  const ringRadius = sizes.ring / 2;
  const barOffset = ringRadius + capsuleGap;
  const puckHalfWidth = barOffset + sizes.capsule.width;
  const viewTop = ringRadius + gap;
  const sideColumnWidth = Math.max(sizes.color.width, sizes.layers.width, sizes.view.width);
  const handEdge = -(kind === 'wide' ? puckHalfWidth : sideColumnWidth / 2) - blockGap;
  const brushX = handEdge - sizes.library.width;
  const toolsX = brushX - gap - sizes.tools.width;
  const brushHeight = sizes.library.height + gap + sizes.studio.height;
  const colorHeight = sizes.color.height + gap + sizes.layers.height;

  /** Tops of color and layers stacked with the QuickMenu: above the ring, or below the view pill. */
  const above = -ringRadius - gap;
  const below = viewTop + sizes.view.height + gap;
  const stacked: Record<typeof stacking, { color: number; layers: number }> = {
    split: { color: above - sizes.color.height, layers: below },
    above: { color: above - sizes.layers.height - gap - sizes.color.height, layers: above - sizes.layers.height },
    below: { color: below, layers: below + sizes.color.height + gap }
  };
  const boxes: Record<Part, Box> = {
    ring: { x: -ringRadius, y: -ringRadius, width: sizes.ring, height: sizes.ring },
    sizeBar: { x: -puckHalfWidth, y: -sizes.capsule.height / 2, ...sizes.capsule },
    opacityBar: { x: barOffset, y: -sizes.capsule.height / 2, ...sizes.capsule },
    view: { x: -sizes.view.width / 2, y: viewTop, ...sizes.view },
    tools: { x: toolsX, y: -sizes.tools.height / 2, ...sizes.tools },
    library: { x: brushX, y: -brushHeight / 2, ...sizes.library },
    studio: { x: brushX, y: -brushHeight / 2 + sizes.library.height + gap, ...sizes.studio },
    color:
      kind === 'wide'
        ? { x: puckHalfWidth + blockGap, y: -colorHeight / 2, ...sizes.color }
        : { x: -sizes.color.width / 2, y: stacked[stacking].color, ...sizes.color },
    layers:
      kind === 'wide'
        ? { x: puckHalfWidth + blockGap, y: -colorHeight / 2 + sizes.color.height + gap, ...sizes.layers }
        : { x: -sizes.layers.width / 2, y: stacked[stacking].layers, ...sizes.layers }
  };
  const puck: Part[] =
    kind === 'wide'
      ? ['ring', 'sizeBar', 'opacityBar', 'view']
      : ['ring', 'sizeBar', 'opacityBar', 'view', 'color', 'layers'];
  const columns: Part[][] =
    kind === 'wide' ? [['tools'], ['library', 'studio'], ['color', 'layers']] : [['tools'], ['library', 'studio']];
  return { kind, boxes, puck, columns };
}

/** One way to lay the cluster out; see `arrange`. */
type Arrangement = ReturnType<typeof arrange>;

/** Every arrangement `clusterLayout` chooses from, in order of preference. */
const arrangements: readonly Arrangement[] = [
  arrange('wide'),
  arrange('tall', 'split'),
  arrange('tall', 'below'),
  arrange('tall', 'above')
];

/** Mirrors the layout with the tools on the left when they go on the right. */
function mirrored(boxes: Record<Part, Box>, side: Hand) {
  const copy = { ...boxes };
  if (side === 'right') {
    for (const part of Object.keys(copy) as Part[]) {
      copy[part] = { ...copy[part], x: -(copy[part].x + copy[part].width) };
    }
  }

  return copy;
}

/** The smallest box containing `boxes`. */
function extentOf(boxes: readonly Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x, y, width: right - x, height: bottom - y };
}

/** Clamps to `[low, high]`; when the range is empty (the part is larger than the space), centers on its middle. */
function clamp(value: number, low: number, high: number) {
  return low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value));
}
