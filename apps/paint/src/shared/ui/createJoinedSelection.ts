import { createMediaQuery } from '@solid-primitives/media';
import { createResizeObserver } from '@solid-primitives/resize-observer';
import { createEffect, onCleanup, type Accessor } from 'solid-js';

/**
 * Draws a list's selected row as one piece with the surface beside the list, as a folder's tab joins its folder: a
 * single shape in the surface's color that covers the row out to the list's end edge, rounds the row's outer corners
 * and curves concavely into the surface above and below the row. When another row is chosen, the shape travels to
 * it in `joinedDuration` milliseconds on `joinedEasing`, re-forming its corners as it goes, and the list scrolls the
 * row fully into view; with `prefers-reduced-motion`, or on the first placement, it moves at once.
 *
 * `layer` is an `<svg>` absolutely positioned at the top left of `list`, the list's scrolling box, which must be its
 * rows' offset parent (positioned), so the shape scrolls with the rows by itself. The layer holds two paths marked
 * `data-join="fill"` and `"edge"` (the outline without the side along the surface, for a focus ring); each frame
 * moves the layer with a transform and rewrites the paths only when the shape's size or corners change. Rows are
 * found by `data-item`, which holds their id.
 *
 * Reads the outer corner radius from `--settings-list-radius` (9 px) and the concave one from
 * `--settings-list-join-radius` (12 px) on `list`. The layer's `data-row` names the row it is drawn at or moving to;
 * it is empty while no row is selected or the selected row is not laid out.
 */
export function createJoinedSelection(options: {
  list: Accessor<HTMLElement | undefined>;
  layer: Accessor<SVGSVGElement | undefined>;
  /** The selected row's id, if any. */
  selected: Accessor<string | undefined>;
  /** Read to place the shape again when it changes, such as the list's items. */
  layout: Accessor<unknown>;
}) {
  const reduced =
    typeof window.matchMedia === 'undefined' ? () => true : createMediaQuery('(prefers-reduced-motion: reduce)');
  /** The shape as drawn now, and the row it belongs to or moves to. */
  let shown: { id: string; frame: JoinedFrame } | undefined;
  let tween: { from: JoinedFrame; to: JoinedFrame; start: number } | undefined;
  let request = 0;
  let drawn = '';

  createEffect(
    () => ({ id: options.selected(), layout: options.layout(), list: options.list(), layer: options.layer() }),
    ({ id }) => place(id, id !== shown?.id)
  );

  if (typeof ResizeObserver !== 'undefined') {
    createResizeObserver(options.list, () => place(options.selected(), false));
  }

  onCleanup(() => cancelAnimationFrame(request));

  /**
   * Draws the shape at row `id`: travelling there from where it is when `moved` and motion is allowed, else at once.
   * Hides it while the row is missing or not laid out, as in a list that is not displayed.
   */
  function place(id: string | undefined, moved: boolean) {
    const list = options.list();
    const layer = options.layer();
    const row = id === undefined || !list ? undefined : rowElement(list, id);
    if (!list || !layer || !row || id === undefined || row.offsetHeight === 0) {
      cancelAnimationFrame(request);
      tween = undefined;
      shown = undefined;
      layer?.setAttribute('data-row', '');
      layer?.style.setProperty('visibility', 'hidden');
      return;
    }

    const target = measuredShape(list, row);
    layer.setAttribute('data-row', id);
    layer.style.removeProperty('visibility');
    if (!moved && tween && shown?.id === id) {
      // The list was laid out again mid-travel: the shape keeps travelling, to where the row is now.
      tween.to = target;
      return;
    }

    if (moved) {
      row.scrollIntoView?.({ block: 'nearest', behavior: shown && !reduced() ? 'smooth' : 'auto' });
    }

    const animate = moved && shown !== undefined && !reduced() && getComputedStyle(layer).display !== 'none';
    if (!animate || !shown) {
      cancelAnimationFrame(request);
      tween = undefined;
      shown = { id, frame: target };
      draw(layer, target);
      return;
    }

    tween = { from: shown.frame, to: target, start: performance.now() };
    shown = { id, frame: shown.frame };
    cancelAnimationFrame(request);
    request = requestAnimationFrame(step);
  }

  /** Draws one frame of the travel and asks for the next until it arrives. */
  function step(now: number) {
    const layer = options.layer();
    if (!tween || !shown || !layer) {
      return;
    }

    const progress = Math.min(1, Math.max(0, (now - tween.start) / joinedDuration));
    const frame = mixFrames(tween.from, tween.to, joinedEasing(progress));
    shown = { id: shown.id, frame };
    draw(layer, frame);
    if (progress < 1) {
      request = requestAnimationFrame(step);
    } else {
      tween = undefined;
    }
  }

  /** Moves the layer to `frame` and rewrites its paths when the shape itself differs from the one drawn. */
  function draw(layer: SVGSVGElement, frame: JoinedFrame) {
    layer.style.transform = `translate(0px, ${frame.top}px)`;
    const outline = joinedOutline(frame);
    if (outline.fill === drawn) {
      return;
    }

    drawn = outline.fill;
    layer.querySelector('[data-join="fill"]')?.setAttribute('d', outline.fill);
    layer.querySelector('[data-join="edge"]')?.setAttribute('d', outline.edge);
  }
}

/** How long the joined shape travels between rows, as the reference tabs' 200 ms. */
export const joinedDuration = 200;

/**
 * The travel's easing, `cubic-bezier(0.3, 0, 0, 1)`: a short start and a long, soft arrival. It is the curve that
 * fits the reference tabs' measured frames best.
 */
export function joinedEasing(progress: number) {
  return cubicBezier(0.3, 0, 0, 1, progress);
}

/** The joined shape of one frame, in pixels of the list's scrolling content. */
export type JoinedFrame = {
  /** The row's top edge and height. */
  top: number;
  height: number;
  /** The row's outer (start) edge and the edge along the joined surface. */
  left: number;
  right: number;
  /** The rounding of the row's two outer corners. */
  radius: number;
  /** The concave corners' radii above and below the row, where it meets the surface. */
  before: number;
  after: number;
};

/**
 * The joined shape for a row at `row` in content `contentHeight` tall. Its outer corners take `metrics.radius`, at
 * most half the row; each concave corner takes `metrics.join` where the content has that much room beyond the row,
 * and only the room there is, so a first row at the very top or a last row at the very bottom of the content curves
 * no further than the content reaches, down to a straight edge. Rows after a group heading have the heading's room.
 */
export function joinedShape(
  row: Pick<JoinedFrame, 'top' | 'height' | 'left' | 'right'>,
  contentHeight: number,
  metrics: { radius: number; join: number }
): JoinedFrame {
  const radius = clamp(metrics.radius, 0, Math.min(row.height, row.right - row.left) / 2);
  const join = clamp(metrics.join, 0, row.right - row.left - radius);

  return {
    ...row,
    radius,
    before: clamp(row.top, 0, join),
    after: clamp(contentHeight - row.top - row.height, 0, join)
  };
}

/**
 * The SVG paths of `frame`, relative to the row's top edge: `fill`, the closed shape, reaching 2 px past the joined
 * edge so the surface and the shape meet without a seam where the list clips them; and `edge`, its outline without
 * the side along the surface, for a focus ring.
 */
export function joinedOutline(frame: JoinedFrame) {
  const { height, left, right, radius, before, after } = frame;
  const outline = [
    `M${right} ${-before}`,
    `A${before} ${before} 0 0 1 ${right - before} 0`,
    `H${left + radius}`,
    `A${radius} ${radius} 0 0 0 ${left} ${radius}`,
    `V${height - radius}`,
    `A${radius} ${radius} 0 0 0 ${left + radius} ${height}`,
    `H${right - after}`,
    `A${after} ${after} 0 0 1 ${right} ${height + after}`
  ].join(' ');

  return { fill: `${outline} H${right + 2} V${-before} Z`, edge: outline };
}

/** `from` and `to` mixed by `amount`, field by field. */
export function mixFrames(from: JoinedFrame, to: JoinedFrame, amount: number): JoinedFrame {
  const mix = (key: keyof JoinedFrame) => from[key] + (to[key] - from[key]) * amount;

  return {
    top: mix('top'),
    height: mix('height'),
    left: mix('left'),
    right: mix('right'),
    radius: mix('radius'),
    before: mix('before'),
    after: mix('after')
  };
}

/** The row of `list` whose `data-item` is `id`. */
function rowElement(list: HTMLElement, id: string) {
  return [...list.querySelectorAll<HTMLElement>('[data-item]')].find((row) => row.dataset.item === id);
}

/** The joined shape of `row` as laid out now in `list`, with the radii `list` sets. */
function measuredShape(list: HTMLElement, row: HTMLElement) {
  const style = getComputedStyle(list);

  return joinedShape(
    { top: row.offsetTop, height: row.offsetHeight, left: row.offsetLeft, right: row.offsetLeft + row.offsetWidth },
    list.scrollHeight,
    {
      radius: pixels(style.getPropertyValue('--settings-list-radius'), 9),
      join: pixels(style.getPropertyValue('--settings-list-join-radius'), 12)
    }
  );
}

/** A length in pixels such as "12px", or `fallback` when it is not one. */
function pixels(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * The value of CSS `cubic-bezier(x1, y1, x2, y2)` at `progress`: the curve's x solved for `progress` by bisection,
 * then its y there.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number, progress: number) {
  if (progress <= 0 || progress >= 1) {
    return clamp(progress, 0, 1);
  }

  const at = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 32; step++) {
    const middle = (low + high) / 2;
    if (at(middle, x1, x2) < progress) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return at((low + high) / 2, y1, y2);
}
