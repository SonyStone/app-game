import { TILE_SIZE } from './brush';
import { isEmptyPackedTile, TILE_BYTES, type TileData } from './tilePixels';

/**
 * A raster mask of a raster layer or a folder: one channel of coverage, one byte per pixel, from 0, hidden, to 255,
 * shown, kept in sparse tiles like a layer's pixels. A pixel without a tile has the mask's `outside` coverage, so a
 * mask reaches as far as the endless canvas does; no tile is uniformly `outside` (see {@link coverageTile}).
 *
 * The mask scales every premultiplied channel of its layer, or of its folder's composite, by its effective coverage,
 * before clipping and before the node's opacity (see `composeStack`). The effective coverage is the stored one, or 255
 * minus it while `inverted`.
 */
export type LayerMask = {
  /**
   * Stable id, unique among the drawing's node and mask ids. It names the mask's plane: a tile change whose `layerId`
   * is a mask id changes that mask's coverage (see `TileChange`).
   */
  id: string;
  /** Stored coverage of every pixel outside the mask's tiles, an integer from 0 to 255. */
  outside: number;
  /** A disabled mask is kept and saved, but has no effect on the canvas. */
  enabled: boolean;
  /** The mask moves with its layer's pixels when the whole layer is transformed. */
  linked: boolean;
  /** The effective coverage is 255 minus the stored one; painting and filling write the stored one reversed. */
  inverted: boolean;
  /** Stored coverage tiles by key `"x,y"`, packed by {@link packMaskTile}, or versions in storage. */
  tiles: Map<string, TileData>;
};

/** A mask's properties without its tiles, as history, the UI state and saved node lists carry them. */
export type MaskInfo = Omit<LayerMask, 'tiles'>;

/** The properties `update-mask` changes. */
export type MaskPatch = Partial<Pick<LayerMask, 'enabled' | 'linked' | 'inverted'>>;

/** A new mask: Reveal all (`outside` 255, no tiles), enabled, linked and not inverted. */
export function newMask(id: string): LayerMask {
  return { id, outside: 255, enabled: true, linked: true, inverted: false, tiles: new Map() };
}

/** `mask` without its tiles. */
export function maskInfo({ tiles: _tiles, ...info }: LayerMask): MaskInfo {
  return info;
}

/** Pixels of a mask tile, one byte each. */
export const MASK_TILE_PIXELS = TILE_SIZE * TILE_SIZE;

/**
 * Packs `coverage`, {@link MASK_TILE_PIXELS} bytes row by row, into a mask tile: a 12-byte record for a tile of one
 * value, otherwise the bytes after an 8-byte header. Both start with a header no RGBA tile (`packTile`) and no
 * compressed tile (`compressTile`) has, so storage and readers tell the planes apart. Tiles are immutable, so packing
 * a tile this module produced returns it.
 */
export function packMaskTile(coverage: Uint8Array): Uint8Array {
  if (packedMasks.has(coverage)) {
    return coverage;
  }

  if (coverage.byteLength !== MASK_TILE_PIXELS) {
    throw new Error('A mask tile holds one byte per pixel.');
  }

  const first = coverage[0]!;
  let uniform = true;
  for (let index = 1; index < coverage.length; index++) {
    if (coverage[index] !== first) {
      uniform = false;
      break;
    }
  }

  const packed = new Uint8Array(uniform ? UNIFORM_BYTES : HEADER_BYTES + MASK_TILE_PIXELS);
  const header = new DataView(packed.buffer);
  header.setUint32(0, MASK_MAGIC, true);
  header.setUint32(4, uniform ? UNIFORM : DENSE, true);
  if (uniform) {
    packed[HEADER_BYTES] = first;
  } else {
    packed.set(coverage, HEADER_BYTES);
  }

  packedMasks.add(packed);
  return packed;
}

/** Whether `data` is a loaded tile {@link packMaskTile} wrote; false for references and RGBA tiles. */
export function isMaskTile(data: TileData | undefined): data is Uint8Array {
  return (
    data instanceof Uint8Array &&
    data.byteLength >= UNIFORM_BYTES &&
    new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, true) === MASK_MAGIC
  );
}

/**
 * The stored coverage of a packed mask tile, {@link MASK_TILE_PIXELS} bytes. Throws for a reference, which must be
 * read from storage first, and for anything that is not a well-formed mask tile.
 */
export function unpackMaskTile(data: TileData): Uint8Array {
  if (!(data instanceof Uint8Array)) {
    throw new Error('Load this tile from storage before decoding it.');
  }

  if (!isMaskTile(data)) {
    throw new Error('Invalid mask tile header.');
  }

  const kind = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(4, true);
  if (kind === UNIFORM && data.byteLength === UNIFORM_BYTES) {
    return new Uint8Array(MASK_TILE_PIXELS).fill(data[HEADER_BYTES]!);
  }

  if (kind === DENSE && data.byteLength === HEADER_BYTES + MASK_TILE_PIXELS) {
    return data.slice(HEADER_BYTES);
  }

  throw new Error('Invalid mask tile.');
}

/**
 * The stored coverage at every pixel of tile data `data` of a mask whose `outside` is `outside`: the tile's own, or
 * `outside` where it has none. A tile storage lost, which it reads as an empty RGBA tile, reads as `outside` too.
 */
export function maskCoverage(data: TileData | undefined, outside: number): Uint8Array {
  if (data === undefined || isEmptyPackedTile(data)) {
    return new Uint8Array(MASK_TILE_PIXELS).fill(outside);
  }

  return unpackMaskTile(data);
}

/** The mask tile holding `coverage`, or undefined when every pixel equals `outside`, which needs no tile. */
export function coverageTile(coverage: Uint8Array, outside: number): Uint8Array | undefined {
  for (let index = 0; index < coverage.length; index++) {
    if (coverage[index] !== outside) {
      return packMaskTile(coverage);
    }
  }

  return undefined;
}

/**
 * `coverage` as an opaque grey RGBA8 tile, each channel holding the stored coverage: the tile the GPU uploads, paints
 * and composites for a mask (see {@link coverageFromRgba}).
 */
export function maskRgba(coverage: Uint8Array): Uint8Array<ArrayBuffer> {
  const rgba = new Uint8Array(TILE_BYTES);
  for (let index = 0, at = 0; index < coverage.length; index++, at += 4) {
    const value = coverage[index]!;
    rgba[at] = rgba[at + 1] = rgba[at + 2] = value;
    rgba[at + 3] = 255;
  }

  return rgba;
}

/**
 * The stored coverage a premultiplied RGBA8 mask tile holds after a stroke painted it (see {@link maskRgba}): its red
 * channel over the stored Hide value. Brushes paint the stored goal grey opaquely, which leaves the tile opaque; an
 * eraser lowers alpha instead, and the coverage it removed moves towards Hide, 0 in effective coverage: stored 0, or
 * 255 for an `inverted` mask. The composite shader reads a mask texture the same way.
 */
export function coverageFromRgba(rgba: Uint8Array, inverted: boolean): Uint8Array {
  if (rgba.byteLength !== TILE_BYTES) {
    throw new Error('Expected an unpacked RGBA tile.');
  }

  const coverage = new Uint8Array(MASK_TILE_PIXELS);
  for (let index = 0, at = 0; index < coverage.length; index++, at += 4) {
    coverage[index] = inverted ? Math.min(255, rgba[at]! + 255 - rgba[at + 3]!) : rgba[at]!;
  }

  return coverage;
}

/** The effective coverage of stored coverage `stored`, 0–255: itself, or 255 minus it for an `inverted` mask. */
export function effectiveCoverage(stored: number, inverted: boolean): number {
  return inverted ? 255 - stored : stored;
}

/**
 * The stored value that paints effective coverage `goal`, 0 (Hide) to 255 (Reveal), into a mask: `goal` itself, or
 * 255 minus it for an `inverted` mask.
 */
export function storedGoal(goal: number, inverted: boolean): number {
  return inverted ? 255 - goal : goal;
}

/** The grey `#rrggbb` a brush paints with to move a mask towards stored value `stored`. */
export function maskBrushColor(stored: number): string {
  const hex = Math.round(Math.min(255, Math.max(0, stored)))
    .toString(16)
    .padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}

/**
 * Moves stored coverage `coverage` towards stored value `goal` in proportion to `amount`, one byte per pixel (a
 * selection's coverage, say): `old + amount × (goal − old)`, rounded, as a fill or a stroke of coverage `amount`
 * paints a mask. Returns a new array.
 */
export function paintCoverage(coverage: Uint8Array, amount: Uint8Array | number, goal: number): Uint8Array {
  const out = new Uint8Array(coverage.length);
  for (let index = 0; index < coverage.length; index++) {
    const k = typeof amount === 'number' ? amount : amount[index]!;
    const old = coverage[index]!;
    out[index] = Math.round(old + ((goal - old) * k) / 255);
  }

  return out;
}

/**
 * Premultiplied RGBA8 `pixels` with every channel scaled by the effective coverage of stored `coverage`, rounded: what
 * Apply mask writes into a raster layer. Returns a new array.
 */
export function maskPixels(pixels: Uint8Array, coverage: Uint8Array, inverted: boolean): Uint8Array {
  const out = new Uint8Array(pixels.length);
  for (let index = 0, at = 0; index < coverage.length; index++, at += 4) {
    const k = effectiveCoverage(coverage[index]!, inverted);
    if (k === 255) {
      out.set(pixels.subarray(at, at + 4), at);
      continue;
    }

    for (let channel = 0; channel < 4; channel++) {
      out[at + channel] = Math.round((pixels[at + channel]! * k) / 255);
    }
  }

  return out;
}

/**
 * The effective coverage of every pixel of a tile as 0–1 floats, from stored `coverage`, for the CPU compositor
 * (`composeStack`).
 */
export function coverageFactors(coverage: Uint8Array, inverted: boolean): Float32Array {
  const out = new Float32Array(coverage.length);
  for (let index = 0; index < coverage.length; index++) {
    out[index] = effectiveCoverage(coverage[index]!, inverted) / 255;
  }

  return out;
}

/** Arrays produced by {@link packMaskTile}; immutable, so they never need packing again. */
const packedMasks = new WeakSet<Uint8Array>();

/** `"MSK1"`, little endian: the first word of every mask tile. */
const MASK_MAGIC = 0x314b534d;
const HEADER_BYTES = 8;
/** Header, the value, and padding to a whole word. */
const UNIFORM_BYTES = 12;
const UNIFORM = 0;
const DENSE = 1;
