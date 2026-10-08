import type { Point } from '../../kit/createSketchCanvas';

/**
 * Places the Glass cluster around the QuickMenu: the QuickMenu's center as close to `at` as the viewport allows, the
 * tools and the brush cards on the hand's side, color and layers on the other side (or above and below the QuickMenu
 * when the viewport is too narrow for three columns), all scaled down when even that does not fit.
 *
 * The QuickMenu moves with `at` vertically; the side columns slide on their own to stay inside the viewport, so the
 * QuickMenu stays under the pen even near the top or the bottom of the screen. Boxes are in unscaled CSS pixels
 * relative to the QuickMenu's center; `center` is in client pixels.
 */
export function clusterLayout(at: Point, viewport: { width: number; height: number }, hand: 'left' | 'right') {
  const candidates = [arrange('wide'), arrange('tall')].map((arrangement) => {
    const extent = extentOf(Object.values(arrangement.boxes));
    const tallest = Math.max(
      ...arrangement.columns.map((column) => extentOf(column.map((part) => arrangement.boxes[part])).height)
    );
    const scale = Math.min(
      1,
      (viewport.width - margin * 2) / extent.width,
      (viewport.height - topMargin - margin) / Math.max(tallest, extentOf(puckParts(arrangement)).height)
    );
    return { arrangement, scale };
  });
  const { arrangement, scale } = candidates[0]!.scale >= candidates[1]!.scale ? candidates[0]! : candidates[1]!;
  const boxes = mirrored(arrangement.boxes, hand);

  const all = extentOf(Object.values(boxes));
  const puck = extentOf(arrangement.puck.map((part) => boxes[part]));
  const center = {
    x: clamp(at.x, margin - all.x * scale, viewport.width - margin - (all.x + all.width) * scale),
    y: clamp(at.y, topMargin - puck.y * scale, viewport.height - margin - (puck.y + puck.height) * scale)
  };

  // Each side column slides vertically, as one piece, until it is inside the viewport.
  for (const column of arrangement.columns) {
    const extent = extentOf(column.map((part) => boxes[part]));
    const top = center.y + extent.y * scale;
    const clampedTop = clamp(top, topMargin, viewport.height - margin - extent.height * scale);
    const shift = (clampedTop - top) / scale;
    for (const part of column) {
      boxes[part] = { ...boxes[part], y: boxes[part].y + shift };
    }
  }

  return { center, scale, boxes, tall: arrangement.kind === 'tall' };
}

/** The parts of the cluster, each a card or a control placed on its own. */
export type Part = 'tools' | 'library' | 'studio' | 'sizeBar' | 'ring' | 'opacityBar' | 'view' | 'color' | 'layers';

/** A part's box relative to the QuickMenu's center, in unscaled CSS pixels. */
export type Box = { x: number; y: number; width: number; height: number };

/**
 * A box as inline CSS for an absolutely placed part. With `height: 'max'` the box's height is only the most the part
 * may take, for cards whose content varies, such as the settings of different tools.
 */
export function placed(box: Box, height: 'fixed' | 'max' = 'fixed') {
  const position = { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px` };
  return height === 'fixed'
    ? { ...position, height: `${box.height}px` }
    : { ...position, 'max-height': `${box.height}px` };
}

/** Sizes of the parts, shared with the components that draw them. */
export const sizes = {
  ring: 176,
  capsule: { width: 32, height: 156 },
  view: { width: 176, height: 44 },
  tools: { width: 52, height: 356 },
  library: { width: 300, height: 284 },
  /** The settings card's reserved height: enough for the brush's ten settings. Shorter lists end earlier. */
  studio: { width: 300, height: 430 },
  color: { width: 276, height: 382 },
  layers: { width: 276, height: 330 }
} as const;

/** Space between neighbouring cards. */
const gap = 10;
/** Space between the QuickMenu with its bars and the columns beside it. */
const blockGap = 14;
/** Space between the bars and the QuickMenu's ring. */
const capsuleGap = 8;
const margin = 8;
/** Keeps the cluster below the gallery's bar. */
const topMargin = 52;

/** Lays the parts out for the left hand: the wide form has three columns, the tall form stacks color and layers around the QuickMenu. */
function arrange(kind: 'wide' | 'tall') {
  const ringRadius = sizes.ring / 2;
  const barOffset = ringRadius + capsuleGap;
  const puckHalfWidth = barOffset + sizes.capsule.width;
  const viewTop = ringRadius + gap;
  const sideColumnWidth = Math.max(sizes.color.width, sizes.layers.width);
  const handEdge = -(kind === 'wide' ? puckHalfWidth : sideColumnWidth / 2) - blockGap;
  const brushX = handEdge - sizes.library.width;
  const toolsX = brushX - gap - sizes.tools.width;
  const brushHeight = sizes.library.height + gap + sizes.studio.height;
  const colorHeight = sizes.color.height + gap + sizes.layers.height;

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
        : { x: -sizes.color.width / 2, y: -ringRadius - gap - sizes.color.height, ...sizes.color },
    layers:
      kind === 'wide'
        ? { x: puckHalfWidth + blockGap, y: -colorHeight / 2 + sizes.color.height + gap, ...sizes.layers }
        : { x: -sizes.layers.width / 2, y: viewTop + sizes.view.height + gap, ...sizes.layers }
  };
  const puck: Part[] =
    kind === 'wide'
      ? ['ring', 'sizeBar', 'opacityBar', 'view']
      : ['ring', 'sizeBar', 'opacityBar', 'view', 'color', 'layers'];
  const columns: Part[][] =
    kind === 'wide' ? [['tools'], ['library', 'studio'], ['color', 'layers']] : [['tools'], ['library', 'studio']];
  return { kind, boxes, puck, columns };
}

function puckParts(arrangement: ReturnType<typeof arrange>) {
  return arrangement.puck.map((part) => arrangement.boxes[part]);
}

/** Mirrors the left hand's layout for the right hand. */
function mirrored(boxes: Record<Part, Box>, hand: 'left' | 'right') {
  const copy = { ...boxes };
  if (hand === 'right') {
    for (const part of Object.keys(copy) as Part[]) {
      copy[part] = { ...copy[part], x: -(copy[part].x + copy[part].width) };
    }
  }

  return copy;
}

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
