import { TILE_SIZE } from '@app-game/paint-core/brush';

/** A bounded area of the infinite canvas in whole document pixels. */
export type FillArea = { left: number; top: number; width: number; height: number };

/**
 * The connected area around `seed` whose pixels are within `tolerance` of the seed pixel, as a mask of the area's
 * size (1 inside). `tiles` holds premultiplied sRGB RGBA8 tiles keyed `"x,y"`, absent where transparent. Pixels match
 * when no RGBA channel differs from the seed's by more than `tolerance` (0–255). The fill is 4-connected and stays
 * within `area`; a seed outside it gives an empty mask.
 */
export function floodMask(
  area: FillArea,
  tiles: ReadonlyMap<string, Uint8Array>,
  seed: { x: number; y: number },
  tolerance: number
): Uint8Array {
  const { width, height } = area;
  const mask = new Uint8Array(width * height);
  const sx = seed.x - area.left,
    sy = seed.y - area.top;
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
    return mask;
  }

  const matching = matchingPixels(area, tiles, seedPixel(tiles, seed), tolerance);
  const open = (x: number, y: number) => matching[y * width + x] === 1 && mask[y * width + x] === 0;
  const stack = [sx, sy];
  while (stack.length > 0) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    if (!open(x, y)) {
      continue;
    }

    while (x > 0 && open(x - 1, y)) {
      x--;
    }

    let above = false,
      below = false;
    for (; x < width && open(x, y); x++) {
      mask[y * width + x] = 1;
      if (y > 0) {
        const next = open(x, y - 1);
        if (next && !above) {
          stack.push(x, y - 1);
        }

        above = next;
      }

      if (y < height - 1) {
        const next = open(x, y + 1);
        if (next && !below) {
          stack.push(x, y + 1);
        }

        below = next;
      }
    }
  }

  return mask;
}

/** The RGBA of the document pixel at `point`, transparent where there is no tile. */
function seedPixel(tiles: ReadonlyMap<string, Uint8Array>, point: { x: number; y: number }): number[] {
  const tx = Math.floor(point.x / TILE_SIZE),
    ty = Math.floor(point.y / TILE_SIZE);
  const tile = tiles.get(`${tx},${ty}`);
  const index = ((point.y - ty * TILE_SIZE) * TILE_SIZE + (point.x - tx * TILE_SIZE)) * 4;
  return [0, 1, 2, 3].map((channel) => tile?.[index + channel] ?? 0);
}

/** Marks the area's pixels within `tolerance` of `target`, a tile at a time. */
function matchingPixels(
  area: FillArea,
  tiles: ReadonlyMap<string, Uint8Array>,
  target: readonly number[],
  tolerance: number
): Uint8Array {
  const matching = new Uint8Array(area.width * area.height);
  const transparentMatches = target.every((value) => value <= tolerance);
  for (const key of areaTiles(area)) {
    const [tx, ty] = key.split(',').map(Number) as [number, number];
    const tile = tiles.get(key);
    const x0 = Math.max(area.left, tx * TILE_SIZE),
      x1 = Math.min(area.left + area.width, (tx + 1) * TILE_SIZE);
    const y0 = Math.max(area.top, ty * TILE_SIZE),
      y1 = Math.min(area.top + area.height, (ty + 1) * TILE_SIZE);
    for (let y = y0; y < y1; y++) {
      const row = (y - area.top) * area.width - area.left;
      for (let x = x0; x < x1; x++) {
        if (!tile) {
          matching[row + x] = transparentMatches ? 1 : 0;
          continue;
        }

        const index = ((y - ty * TILE_SIZE) * TILE_SIZE + (x - tx * TILE_SIZE)) * 4;
        matching[row + x] =
          Math.abs(tile[index]! - target[0]!) <= tolerance &&
          Math.abs(tile[index + 1]! - target[1]!) <= tolerance &&
          Math.abs(tile[index + 2]! - target[2]!) <= tolerance &&
          Math.abs(tile[index + 3]! - target[3]!) <= tolerance
            ? 1
            : 0;
      }
    }
  }

  return matching;
}

/**
 * Grows a mask by `radius` pixels in every direction (a square), so that a fill reaches under the antialiased edges
 * of the lines around it. Runs in time proportional to the area, whatever the radius.
 */
export function expandMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) {
    return mask;
  }

  const rows = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    dilateLine(mask, rows, y * width, 1, width, radius);
  }

  const result = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    dilateLine(rows, result, x, width, height, radius);
  }

  return result;
}

/** Sets each output pixel of a line when any input pixel within `radius` along the line is set. */
function dilateLine(
  input: Uint8Array,
  output: Uint8Array,
  start: number,
  step: number,
  length: number,
  radius: number
) {
  // Counts set pixels in the window [i - radius, i + radius] as it slides.
  let count = 0;
  for (let i = 0; i < Math.min(radius, length); i++) {
    count += input[start + i * step]!;
  }

  for (let i = 0; i < length; i++) {
    if (i + radius < length) {
      count += input[start + (i + radius) * step]!;
    }

    if (i - radius - 1 >= 0) {
      count -= input[start + (i - radius - 1) * step]!;
    }

    output[start + i * step] = count > 0 ? 1 : 0;
  }
}

/**
 * Paints `color` with `opacity` over a tile's premultiplied pixels where the area mask is set, source-over. Returns
 * the new tile, or `undefined` when the mask does not touch the tile.
 */
export function fillTile(
  key: string,
  base: Uint8Array | undefined,
  mask: Uint8Array,
  area: FillArea,
  color: readonly [number, number, number],
  opacity: number
): Uint8Array | undefined {
  const [tx, ty] = key.split(',').map(Number) as [number, number];
  const x0 = Math.max(area.left, tx * TILE_SIZE),
    x1 = Math.min(area.left + area.width, (tx + 1) * TILE_SIZE);
  const y0 = Math.max(area.top, ty * TILE_SIZE),
    y1 = Math.min(area.top + area.height, (ty + 1) * TILE_SIZE);
  const result = base ? new Uint8Array(base) : new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  const source = color.map((channel) => channel * opacity);
  const keep = 1 - opacity;
  let touched = false;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!mask[(y - area.top) * area.width + (x - area.left)]) {
        continue;
      }

      const index = ((y - ty * TILE_SIZE) * TILE_SIZE + (x - tx * TILE_SIZE)) * 4;
      for (let channel = 0; channel < 3; channel++) {
        result[index + channel] = Math.round(source[channel]! + result[index + channel]! * keep);
      }

      result[index + 3] = Math.round(opacity * 255 + result[index + 3]! * keep);
      touched = true;
    }
  }

  return touched ? result : undefined;
}

/** Keys of the tiles an area overlaps. */
export function areaTiles(area: FillArea): string[] {
  const keys: string[] = [];
  for (let ty = Math.floor(area.top / TILE_SIZE); ty * TILE_SIZE < area.top + area.height; ty++) {
    for (let tx = Math.floor(area.left / TILE_SIZE); tx * TILE_SIZE < area.left + area.width; tx++) {
      keys.push(`${tx},${ty}`);
    }
  }

  return keys;
}
