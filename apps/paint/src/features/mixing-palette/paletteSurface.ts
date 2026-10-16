import { mixInto, type Rgb } from './pigment';

/**
 * The mixing palette's paint, as straight (not premultiplied) 8-bit RGBA pixels: the color of the paint and, in alpha,
 * how much of the palette it covers. Every operation changes `data` in place and returns the rectangle it touched, for
 * redrawing; none allocate per pixel. Positions and radii are in palette pixels.
 */
export type PaletteSurface = { width: number; height: number; data: Uint8ClampedArray };

/** A rectangle of palette pixels that changed; empty when `width` or `height` is 0. */
export type Dirty = { x: number; y: number; width: number; height: number };

/** A blank palette of `width` × `height` pixels. */
export function createSurface(width: number, height: number): PaletteSurface {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** Wipes all paint off the palette. */
export function clearSurface(surface: PaletteSurface): Dirty {
  surface.data.fill(0);
  return { x: 0, y: 0, width: surface.width, height: surface.height };
}

/** The palette has no paint at all. */
export function isBlank(surface: PaletteSurface) {
  const { data } = surface;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index]! > 0) {
      return false;
    }
  }

  return true;
}

/**
 * Lays a dab of fresh paint, as squeezed from a tube: an opaque disk of `color` with a soft rim, covering the paint
 * under it. A stroke of dabs along a drag lays a ribbon of paint.
 */
export function dab(surface: PaletteSurface, x: number, y: number, radius: number, color: Rgb): Dirty {
  return eachInDisk(surface, x, y, radius, (index, weight) => {
    const { data } = surface;
    const below = data[index + 3]! / 255;
    const alpha = weight + below * (1 - weight);
    if (alpha <= 0) {
      return;
    }

    const share = weight / alpha;
    data[index] = data[index]! + (color[0] - data[index]!) * share;
    data[index + 1] = data[index + 1]! + (color[1] - data[index + 1]!) * share;
    data[index + 2] = data[index + 2]! + (color[2] - data[index + 2]!) * share;
    data[index + 3] = alpha * 255;
  });
}

/** Wipes paint off a disk, softly at its rim, as a cloth or the pen's eraser end does. */
export function wipe(surface: PaletteSurface, x: number, y: number, radius: number): Dirty {
  return eachInDisk(surface, x, y, radius, (index, weight) => {
    surface.data[index + 3] = surface.data[index + 3]! * (1 - weight);
  });
}

/**
 * The paint a palette knife carries: a patch of pixels the size of its blade, centered on it. A knife pressed onto
 * the palette picks up the paint under it, so its first move spreads that paint.
 */
export type Knife = { radius: number; side: number; load: Uint8ClampedArray; at: { x: number; y: number } };

/** Presses a knife of `radius` onto the palette at `x`, `y`, loading it with the paint there. */
export function pressKnife(surface: PaletteSurface, x: number, y: number, radius: number): Knife {
  const r = Math.ceil(radius);
  const side = r * 2 + 1;
  const load = new Uint8ClampedArray(side * side * 4);
  const cx = Math.round(x),
    cy = Math.round(y);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const px = cx + dx,
        py = cy + dy;
      if (px < 0 || py < 0 || px >= surface.width || py >= surface.height) {
        continue;
      }

      const from = (py * surface.width + px) * 4;
      load.set(surface.data.subarray(from, from + 4), ((dy + r) * side + dx + r) * 4);
    }
  }

  return { radius, side, load, at: { x, y } };
}

/**
 * Drags the knife to `x`, `y`, smearing and mixing as it goes: at each step along the way the paint on the palette and
 * on the knife exchange, mixed as pigments (see `mixInto`). Paint moves with the drag and thins out into bare palette;
 * a clean knife scrapes paint up and lays it down further on.
 */
export function dragKnife(surface: PaletteSurface, knife: Knife, x: number, y: number): Dirty {
  const { at } = knife;
  const distance = Math.hypot(x - at.x, y - at.y);
  const spacing = Math.max(1, knife.radius * knifeSpacing);
  const steps = Math.floor(distance / spacing);
  let dirty: Dirty = { x: 0, y: 0, width: 0, height: 0 };
  for (let step = 1; step <= steps; step++) {
    const t = (step * spacing) / distance;
    dirty = union(dirty, smearAt(surface, knife, at.x + (x - at.x) * t, at.y + (y - at.y) * t));
  }

  if (steps > 0) {
    const t = (steps * spacing) / distance;
    knife.at = { x: at.x + (x - at.x) * t, y: at.y + (y - at.y) * t };
  }

  return dirty;
}

/**
 * The color of the paint around `x`, `y` within `radius`, averaged by coverage; undefined where the palette is bare
 * or nearly so, so that loading the brush there does nothing.
 */
export function sampleColor(surface: PaletteSurface, x: number, y: number, radius: number): Rgb | undefined {
  let r = 0,
    g = 0,
    b = 0,
    coverage = 0,
    count = 0;
  eachInDisk(surface, x, y, radius, (index) => {
    const alpha = surface.data[index + 3]!;
    r += surface.data[index]! * alpha;
    g += surface.data[index + 1]! * alpha;
    b += surface.data[index + 2]! * alpha;
    coverage += alpha;
    count++;
  });
  if (count === 0 || coverage / count < minPickCoverage * 255) {
    return undefined;
  }

  return [Math.round(r / coverage), Math.round(g / coverage), Math.round(b / coverage)];
}

/** Steps of a knife drag, as a share of its radius. */
const knifeSpacing = 0.25;

/** At the blade's center, the share of the palette's paint replaced by the knife's in one step. */
const deposit = 0.35;

/** At the blade's center, the share of the knife's paint replaced by the palette's in one step. */
const pickup = 0.2;

/** How much more slowly the knife gives its paint to thinner paint than it takes up thicker paint. */
const holding = 0.3;

/** Share of its paint the knife loses at its center in one step, so that a long drag runs dry. */
const drying = 0.015;

/** Average coverage below which a pick finds no paint. */
const minPickCoverage = 0.15;

/** One step of a knife at `x`, `y`; see `dragKnife`. */
function smearAt(surface: PaletteSurface, knife: Knife, x: number, y: number): Dirty {
  const { data } = surface;
  const { load, side } = knife;
  const r = Math.floor(side / 2);
  const cx = Math.round(x),
    cy = Math.round(y);
  return eachInDisk(surface, cx, cy, knife.radius, (index, weight, dx, dy) => {
    const at = ((dy + r) * side + dx + r) * 4;
    const surfaceAlpha = data[index + 3]! / 255;
    const loadAlpha = load[at + 3]! / 255;
    if (surfaceAlpha <= 0 && loadAlpha <= 0) {
      return;
    }

    const share = deposit * weight;
    const loadShare = pickup * weight;
    mixInto(
      data[index]!,
      data[index + 1]!,
      data[index + 2]!,
      surfaceAlpha * (1 - share),
      load[at]!,
      load[at + 1]!,
      load[at + 2]!,
      loadAlpha * share,
      mixed
    );
    const nextSurfaceAlpha = surfaceAlpha + (loadAlpha - surfaceAlpha) * share;
    // The knife scrapes thicker paint up readily but holds on to its own over thinner paint, so a drag carries far.
    const exchange = surfaceAlpha > loadAlpha ? loadShare : loadShare * holding;
    const nextLoadAlpha = (loadAlpha + (surfaceAlpha - loadAlpha) * exchange) * (1 - drying * weight);
    // The knife takes on the mixture; a bare knife takes the palette's paint as it is.
    const take = loadAlpha <= 0 ? 1 : loadShare;
    load[at] = load[at]! + (mixed[0]! - load[at]!) * take;
    load[at + 1] = load[at + 1]! + (mixed[1]! - load[at + 1]!) * take;
    load[at + 2] = load[at + 2]! + (mixed[2]! - load[at + 2]!) * take;
    load[at + 3] = nextLoadAlpha * 255;
    data[index] = mixed[0]!;
    data[index + 1] = mixed[1]!;
    data[index + 2] = mixed[2]!;
    data[index + 3] = nextSurfaceAlpha * 255;
  });
}

/** Scratch color of `smearAt`. */
const mixed = new Float64Array(3);

/**
 * Calls `visit` for every palette pixel within `radius` of `x`, `y` with its byte index, its weight (1 inside, falling
 * smoothly to 0 at the rim) and its offset from the rounded center. Returns the rectangle visited.
 */
function eachInDisk(
  surface: PaletteSurface,
  x: number,
  y: number,
  radius: number,
  visit: (index: number, weight: number, dx: number, dy: number) => void
): Dirty {
  const r = Math.ceil(radius);
  const cx = Math.round(x),
    cy = Math.round(y);
  const left = Math.max(0, cx - r),
    top = Math.max(0, cy - r);
  const right = Math.min(surface.width - 1, cx + r),
    bottom = Math.min(surface.height - 1, cy + r);
  for (let py = top; py <= bottom; py++) {
    for (let px = left; px <= right; px++) {
      const distance = Math.hypot(px - x, py - y) / radius;
      if (distance >= 1) {
        continue;
      }

      visit((py * surface.width + px) * 4, rim(distance), px - cx, py - cy);
    }
  }

  return right < left || bottom < top
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** A disk's weight at `distance` from its center, as a share of its radius: 1 inside, easing to 0 over the rim. */
function rim(distance: number) {
  const t = Math.min(1, Math.max(0, (distance - rimStart) / (1 - rimStart)));
  return 1 - t * t * (3 - 2 * t);
}

/** Where a disk's soft rim starts, as a share of its radius. */
const rimStart = 0.65;

/** The smallest rectangle holding both; an empty one adds nothing. */
export function union(a: Dirty, b: Dirty): Dirty {
  if (a.width === 0 || a.height === 0) {
    return b;
  }

  if (b.width === 0 || b.height === 0) {
    return a;
  }

  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y
  };
}
