import type { PsdImage, PsdRegionRect } from '@app-game/psd/viewer';

/** Immutable straight display-sRGB bytes and a nonoverlapping document-space drawing rectangle. */
export type DisplayTile = {
  /** May include a neighbor halo supporting all retained mip levels around the drawing rectangle. */
  image: PsdImage;
  /** One bounded worker region and its mips; whole-render/point-preview chunks have a separate latency cohort. */
  contentTile?: boolean;
  left: number;
  top: number;
  step: number;
  clip: PsdRegionRect;
};

/** Whole renders and worker regions share the same display contract; tiled frames allocate no assembled pixels. */
export type DisplayImage = PsdImage & {
  tiles?: readonly DisplayTile[];
  window?: { left: number; top: number; step: number };
};

/** Splits whole renders into bounded texture uploads, retaining the transferred buffer without copying its rows. */
export function displayTiles(image: DisplayImage): readonly DisplayTile[] {
  if (image.tiles) {
    return image.tiles.flatMap(splitTile);
  }

  const cached = chunks.get(image);
  if (cached) {
    return cached;
  }

  const result: DisplayTile[] = [];
  const { left = 0, top = 0, step = 1 } = image.window ?? {};
  for (let y = 0; y < image.height; y += 512) {
    for (let x = 0; x < image.width; x += 512) {
      result.push({
        image,
        left,
        top,
        step,
        clip: {
          left: left + x * step,
          top: top + y * step,
          width: Math.min(512, image.width - x) * step,
          height: Math.min(512, image.height - y) * step
        }
      });
    }
  }

  chunks.set(image, result);
  return result;
}

/**
 * Returns only the source rows needed by a bordered texture upload. The typed view shares the worker buffer.
 * WebGPU snapshots BufferSource bytes before interpreting bytesPerRow, so passing the whole image copies excess data.
 */
export function tileTextureUpload(tile: DisplayTile) {
  const { image, clip, step } = tile;
  const x = Math.max(0, Math.round((clip.left - tile.left) / step) - 1);
  const y = Math.max(0, Math.round((clip.top - tile.top) / step) - 1);
  const right = Math.min(image.width, Math.ceil((clip.left + clip.width - tile.left) / step) + 1);
  const bottom = Math.min(image.height, Math.ceil((clip.top + clip.height - tile.top) / step) + 1);
  const width = right - x;
  const height = bottom - y;
  const offset = (y * image.width + x) * 4;
  const length = ((height - 1) * image.width + width) * 4;
  return {
    source: new Uint8Array(image.pixels.buffer as ArrayBuffer, image.pixels.byteOffset + offset, length),
    bytesPerRow: image.width * 4,
    width,
    height,
    left: tile.left + x * step,
    top: tile.top + y * step
  };
}

/** Groups alternate resolutions of the same source coverage, coarsest first and selects the closest available requested resolution. */
export function displayTileLevels(tiles: readonly DisplayTile[], step = 1) {
  const groups = new Map<string, DisplayTile[]>();
  for (const tile of tiles) {
    const { left, top, width, height } = tile.clip;
    const key = `${left}:${top}:${width}:${height}`;
    const levels = groups.get(key) ?? [];
    levels.push(tile);
    groups.set(key, levels);
  }

  return [...groups.values()].map((levels) => {
    levels.sort((a, b) => b.step - a.step);
    const requested = levels.find((tile) => tile.step <= step) ?? levels.at(-1)!;
    return { levels, requested, coarse: levels[0] };
  });
}

const chunks = new WeakMap<PsdImage, readonly DisplayTile[]>();

/** Keeps every upload bounded, including coarse overviews whose source image can exceed a texture's limits. */
function splitTile(tile: DisplayTile): readonly DisplayTile[] {
  const cached = tileChunks.get(tile);
  if (cached) {
    return cached;
  }

  const edge = 512 * tile.step;
  if (tile.clip.width <= edge && tile.clip.height <= edge) {
    return [tile];
  }

  const result: DisplayTile[] = [];
  for (let y = 0; y < tile.clip.height; y += edge) {
    for (let x = 0; x < tile.clip.width; x += edge) {
      result.push({
        ...tile,
        clip: {
          left: tile.clip.left + x,
          top: tile.clip.top + y,
          width: Math.min(edge, tile.clip.width - x),
          height: Math.min(edge, tile.clip.height - y)
        }
      });
    }
  }

  tileChunks.set(tile, result);
  return result;
}

const tileChunks = new WeakMap<DisplayTile, readonly DisplayTile[]>();
