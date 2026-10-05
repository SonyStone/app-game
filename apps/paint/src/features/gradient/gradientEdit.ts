import { TILE_SIZE } from '@app-game/paint-core/brush';
import { defineDocumentEdit } from '@app-game/paint-core/composition/documentEdit';
import type { TileChange } from '@app-game/paint-core/document';
import { selectionBounds, tileCoverage, type SelectionMask } from '@app-game/paint-core/selectionMask';
import { z } from 'zod';

/**
 * The engine half of the gradient tool: draws a gradient from `start` to `end` over the active layer, as one undo
 * step: linear, radial, angle (sweeping clockwise around `start` from the direction of `end`) or diamond, ending at
 * `end` or repeating there (see {@link gradientPosition}). The gradient runs through its color `stops`, mixed in linear light (`linear`,
 * like Smooth color) or in encoded sRGB (`classic`), and is laid over the layer's pixels with `opacity`; a layer with
 * locked transparency keeps its alpha. It covers the selection, in proportion to its coverage, within its bounds or,
 * for a selection without bounds or without any, within `area`, the view's bounds, since the canvas has no edges; at
 * most {@link maxGradientSide} pixels per side. Results are dithered
 * so that slow ramps do not band. Runs in the drawing engine's realm.
 */
export const gradientEdit = defineDocumentEdit({
  id: 'gradient',
  parse: (input: unknown) => gradientCommandSchema.parse(input),
  async run(context, command) {
    const layer = context.active;
    if (!layer.visible) {
      throw new Error('Show the active layer before drawing a gradient on it.');
    }

    const area = gradientArea(command, context.selection);
    if (area.width > maxGradientSide || area.height > maxGradientSide) {
      throw new Error('This area is too large for a gradient at this zoom. Zoom in or select a part of it.');
    }

    const ramp = createRamp(command);
    const changes: TileChange[] = [];
    for (const key of tileKeys(area)) {
      const before = layer.tiles.get(key);
      if (layer.alphaLock && !before) {
        continue;
      }

      const [tx, ty] = key.split(',').map(Number) as [number, number];
      const coverage = tileCoverage(context.selection, tx, ty);
      if (coverage.kind === 'outside' && (context.selection.outside === 255 || context.selection.tiles.size > 0)) {
        continue;
      }

      const after = paintTile(
        key,
        before && (await context.readTile(before)),
        area,
        command,
        ramp,
        layer.alphaLock,
        coverage.kind === 'partial' ? coverage.coverage : undefined
      );
      if (after) {
        changes.push({ layerId: layer.id, key, before, after });
      }
    }

    return { changes };
  }
});

/** A gradient command; see {@link gradientEdit}. */
export type GradientCommand = z.infer<typeof gradientCommandSchema>;

/** Longest side, in document pixels, of the area a gradient covers. */
export const maxGradientSide = 4096;

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const gradientCommandSchema = z.object({
  start: point,
  end: point,
  kind: z.enum(['linear', 'radial', 'angle', 'diamond']),
  /** Past `end`, the last color continues (`none`), the gradient starts over (`repeat`) or runs back (`reflect`). */
  repeat: z.enum(['none', 'repeat', 'reflect']).default('none'),
  /**
   * Colors along the gradient, at `position` from 0 (start) to 1 (end), in order: `#rrggbb` with `alpha` from 0 to
   * 1. Before the first stop and after the last, their colors continue.
   */
  stops: z
    .array(
      z.object({
        position: z.number().min(0).max(1),
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
        alpha: z.number().min(0).max(1)
      })
    )
    .min(2)
    .max(16),
  opacity: z.number().min(0).max(1),
  mixing: z.enum(['linear', 'classic']),
  /** The view's bounds in document pixels, covered without a selection. */
  area: z.object({
    left: z.number().finite(),
    top: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative()
  })
});

/** Whole pixels covered: the selection's bounds, or the view's. */
function gradientArea(command: GradientCommand, selection: SelectionMask) {
  const bounds = selectionBounds(selection);
  if (bounds) {
    return {
      left: bounds.left,
      top: bounds.top,
      width: bounds.right - bounds.left,
      height: bounds.bottom - bounds.top
    };
  }

  const left = Math.floor(command.area.left),
    top = Math.floor(command.area.top);
  return {
    left,
    top,
    width: Math.ceil(command.area.left + command.area.width) - left,
    height: Math.ceil(command.area.top + command.area.height) - top
  };
}

/**
 * The gradient's color at a position from 0 (start) to 1 (end), premultiplied, in the space it mixes in: linear
 * light or encoded sRGB, channels from 0 to 1, with `opacity` applied.
 */
export function createRamp(command: Pick<GradientCommand, 'stops' | 'opacity' | 'mixing'>) {
  const linear = command.mixing === 'linear';
  const stops = [...command.stops]
    .sort((a, b) => a.position - b.position)
    .map(({ position, color, alpha }) => ({
      position,
      // Premultiplied, in the mixing space.
      rgba: [...hexChannels(color).map((channel) => (linear ? decode(channel) : channel) * alpha), alpha]
    }));
  return {
    linear,
    /** Writes the premultiplied color at `t` into `out`. */
    at(t: number, out: number[]) {
      let next = stops.findIndex((stop) => stop.position >= t);
      if (next === -1) {
        next = stops.length - 1;
      }

      const b = stops[next]!,
        a = stops[Math.max(0, next - 1)]!;
      const span = b.position - a.position;
      const share = span > 0 ? Math.min(1, Math.max(0, (t - a.position) / span)) : 1;
      for (let channel = 0; channel < 4; channel++) {
        out[channel] = (a.rgba[channel]! + (b.rgba[channel]! - a.rgba[channel]!) * share) * command.opacity;
      }
    }
  };
}

/**
 * Where a document point falls along the gradient, from 0 at `start` to 1 at `end`. Linear runs along the drag, radial
 * outwards from `start`, angle clockwise around it starting at the drag's direction, and diamond outwards in a square
 * whose corner is at `end`. The position is then clamped, repeated or reflected as `repeat` says.
 */
export function gradientPosition(
  command: Pick<GradientCommand, 'start' | 'end' | 'kind' | 'repeat'>,
  x: number,
  y: number
) {
  const dx = command.end.x - command.start.x,
    dy = command.end.y - command.start.y;
  const length = Math.hypot(dx, dy) || 1;
  const px = x - command.start.x,
    py = y - command.start.y;
  // Along the drag and across it, in lengths of the drag.
  const along = (px * dx + py * dy) / (length * length),
    across = (py * dx - px * dy) / (length * length);
  const t =
    command.kind === 'linear'
      ? along
      : command.kind === 'radial'
        ? Math.hypot(along, across)
        : command.kind === 'diamond'
          ? Math.abs(along) + Math.abs(across)
          : (Math.atan2(across, along) / (2 * Math.PI) + 1) % 1;
  if (command.repeat === 'repeat') {
    return t - Math.floor(t);
  }

  if (command.repeat === 'reflect') {
    const cycle = t - 2 * Math.floor(t / 2);
    return cycle > 1 ? 2 - cycle : cycle;
  }

  return Math.min(1, Math.max(0, t));
}

/**
 * The gradient laid over one tile's pixels inside the area, scaled by the selection's `coverage` of the tile when it
 * is partly selected; `undefined` when it touches none.
 */
function paintTile(
  key: string,
  base: Uint8Array | undefined,
  area: ReturnType<typeof gradientArea>,
  command: GradientCommand,
  ramp: ReturnType<typeof createRamp>,
  alphaLock: boolean | undefined,
  coverage: Uint8Array | undefined
): Uint8Array | undefined {
  const [tx, ty] = key.split(',').map(Number) as [number, number];
  const result = base ? new Uint8Array(base) : new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  const source = [0, 0, 0, 0];
  let touched = false;
  for (let y = Math.max(area.top, ty * TILE_SIZE); y < Math.min(area.top + area.height, (ty + 1) * TILE_SIZE); y++) {
    const x0 = Math.max(area.left, tx * TILE_SIZE),
      x1 = Math.min(area.left + area.width, (tx + 1) * TILE_SIZE);
    for (let x = x0; x < x1; x++) {
      const pixel = (y - ty * TILE_SIZE) * TILE_SIZE + (x - tx * TILE_SIZE);
      const covered = coverage ? coverage[pixel]! / 255 : 1;
      if (!covered) {
        continue;
      }

      ramp.at(gradientPosition(command, x + 0.5, y + 0.5), source);
      if (covered < 1) {
        for (let channel = 0; channel < 4; channel++) {
          source[channel] = source[channel]! * covered;
        }
      }

      if (blendPixel(result, pixel * 4, source, ramp.linear, alphaLock ?? false, dither(x, y))) {
        touched = true;
      }
    }
  }

  return touched ? result : undefined;
}

/**
 * Lays a premultiplied `source` color over the 8-bit premultiplied sRGB pixel at `index`, in linear light or in
 * encoded sRGB; under alpha lock the pixel keeps its alpha and transparent pixels stay untouched. `noise` from -0.5
 * to 0.5 dithers the rounding. Returns whether the pixel was written.
 */
export function blendPixel(
  pixels: Uint8Array,
  index: number,
  source: readonly number[],
  linear: boolean,
  alphaLock: boolean,
  noise = 0
) {
  const baseAlpha = pixels[index + 3]! / 255;
  if (alphaLock && baseAlpha === 0) {
    return false;
  }

  const keep = 1 - source[3]!;
  const alpha = source[3]! + baseAlpha * keep;
  if (alpha <= 0) {
    return false;
  }

  const targetAlpha = alphaLock ? baseAlpha : alpha;
  for (let channel = 0; channel < 3; channel++) {
    // The base pixel's straight color, in the mixing space.
    const straight = baseAlpha > 0 ? pixels[index + channel]! / 255 / baseAlpha : 0;
    const base = (linear ? decode(straight) : straight) * baseAlpha;
    const mixed = (source[channel]! + base * keep) / alpha;
    const encoded = linear ? encode(mixed) : mixed;
    pixels[index + channel] = clampByte(encoded * targetAlpha * 255 + noise);
  }

  pixels[index + 3] = alphaLock ? pixels[index + 3]! : clampByte(alpha * 255 + noise);
  return true;
}

/** Keys of the tiles overlapping the area. */
function tileKeys(area: ReturnType<typeof gradientArea>) {
  const keys: string[] = [];
  for (let ty = Math.floor(area.top / TILE_SIZE); ty * TILE_SIZE < area.top + area.height; ty++) {
    for (let tx = Math.floor(area.left / TILE_SIZE); tx * TILE_SIZE < area.left + area.width; tx++) {
      keys.push(`${tx},${ty}`);
    }
  }

  return keys;
}

/** Ordered noise from -0.5 to 0.5 per pixel, from a 4 × 4 Bayer matrix. */
function dither(x: number, y: number) {
  return (bayer[(y & 3) * 4 + (x & 3)]! + 0.5) / 16 - 0.5;
}

const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function hexChannels(hex: string) {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** The sRGB transfer function, encoded to linear light, through a table finer than 8-bit input. */
function decode(channel: number) {
  return decodeTable[Math.round(Math.min(1, Math.max(0, channel)) * tableSteps)]!;
}

/** Linear light to encoded sRGB, through a table fine enough for 8-bit output in the darks. */
function encode(channel: number) {
  return encodeTable[Math.round(Math.min(1, Math.max(0, channel)) * tableSteps)]!;
}

const tableSteps = 16384;

const decodeTable = Float32Array.from({ length: tableSteps + 1 }, (_, index) => {
  const channel = index / tableSteps;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
});

const encodeTable = Float32Array.from({ length: tableSteps + 1 }, (_, index) => {
  const channel = index / tableSteps;
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
});

function clampByte(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}
