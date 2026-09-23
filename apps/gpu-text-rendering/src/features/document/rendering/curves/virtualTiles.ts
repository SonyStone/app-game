import type { SceneFrame } from '../createFrame';

/** Image metadata and packed, permanently resident mip tail. Levels use floor-sized WebGPU mip dimensions. */
export type VirtualImage = {
  id: number;
  width: number;
  height: number;
  level: number;
  x: number;
  y: number;
  tailWidth: number;
  tailHeight: number;
};

/** A source-image tile; keys remain stable across camera movement and GPU eviction. */
export type Tile = { image: number; level: number; x: number; y: number };

/** Packs all small mip levels together, adapting their maximum size to a 16 MiB document-wide budget. */
export function packMipTails(table: DataView) {
  for (let side = 32; side >= 1; side /= 2) {
    const images: VirtualImage[] = [];
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    let width = 1;

    for (let id = 0; id < table.byteLength / 24; id++) {
      const w = table.getUint32(id * 24, true);
      const h = table.getUint32(id * 24 + 4, true);
      const level = Math.max(0, Math.ceil(Math.log2(Math.max(w, h) / (h === 1 ? side * 16 : side))));
      let tailWidth = 0;

      for (let l = level; l <= lastLevel(w, h); l++) {
        tailWidth += mipSize(w, l) + 2;
      }

      const tailHeight = mipSize(h, level) + 2;

      if (x + tailWidth > 2048) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }

      images.push({ id, width: w, height: h, level, x, y, tailWidth, tailHeight });
      x += tailWidth;
      width = Math.max(width, x);
      rowHeight = Math.max(rowHeight, tailHeight);
    }

    if (y + rowHeight <= 2048) {
      return { images, width, height: Math.max(1, y + rowHeight) };
    }
  }

  // GDOC allows at most 10,000 images: even their 3x3 terminal levels fit in this atlas.
  return { images: [] as VirtualImage[], width: 1, height: 1 };
}

/** Conservative viewport-to-image inverse projection, including page layout, reflections and camera rotation. */
export function visibleImage(
  records: DataView,
  index: number,
  frame: SceneFrame,
  page = frame.visible.find(({ index: page }) => page === records.getUint32(index * 80 + 76, true))?.page
) {
  const offset = index * 80;
  const m = frame.rotation;
  const px = (records.getFloat32(offset + 16, true) - (page?.x ?? 0)) * frame.mul[0] + frame.add[0];
  const py = (1 - records.getFloat32(offset + 20, true) - (page?.y ?? 0)) * frame.mul[1] + frame.add[1];
  const ax = records.getFloat32(offset, true) * frame.mul[0];
  const ay = -records.getFloat32(offset + 4, true) * frame.mul[1];
  const bx = records.getFloat32(offset + 8, true) * frame.mul[0];
  const by = -records.getFloat32(offset + 12, true) * frame.mul[1];
  const x = m[0]! * px + m[2]! * py;
  const y = m[1]! * px + m[3]! * py;
  const ux = m[0]! * ax + m[2]! * ay;
  const uy = m[1]! * ax + m[3]! * ay;
  const vx = m[0]! * bx + m[2]! * by;
  const vy = m[1]! * bx + m[3]! * by;
  const determinant = ux * vy - uy * vx;
  if (Math.abs(determinant) < 1e-20) return undefined;
  // Inverse affine projection of the viewport's center and axis-aligned extents.
  const centerU = (-x * vy + y * vx) / determinant;
  const centerV = (-y * ux + x * uy) / determinant;
  const extentU = (Math.abs(vy) + Math.abs(vx)) / Math.abs(determinant);
  const extentV = (Math.abs(uy) + Math.abs(ux)) / Math.abs(determinant);
  const left = Math.max(0, centerU - extentU);
  const right = Math.min(1, centerU + extentU);
  const top = Math.max(0, centerV - extentV);
  const bottom = Math.min(1, centerV + extentV);
  if (left >= right || top >= bottom) return undefined;
  return {
    left,
    right,
    top,
    bottom,
    width: Math.hypot((ux * frame.width) / 2, (uy * frame.height) / 2),
    height: Math.hypot((vx * frame.width) / 2, (vy * frame.height) / 2),
    distance: Math.hypot(x + (ux + vx) / 2, y + (uy + vy) / 2)
  };
}

/** Candidate tiles ordered from coarse coverage to detail, then by distance from the visible image center. */
export function imageTiles(image: VirtualImage, region: NonNullable<ReturnType<typeof visibleImage>>) {
  return imageTileRanges(image, region).flatMap(({ level, left, right, top, bottom }) => {
    const result: (Tile & { priority: number })[] = [];
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const tile = { image: image.id, level, x, y, priority: 0 };
        tile.priority = imageTilePriority(image, region, tile);
        result.push(tile);
      }
    }
    return result;
  });
}

/** Bounded placement cache. Membership changes only at LOD/tile boundaries; priorities remain exact each frame. */
export function createImageTileCache(maxTiles = 16384) {
  const entries = new Map<number, { signature: string; tiles: ReturnType<typeof imageTiles> }>();
  let size = 0;
  return (placement: number, image: VirtualImage, region: NonNullable<ReturnType<typeof visibleImage>>) => {
    const signature = imageTileRanges(image, region)
      .map(({ level, left, right, top, bottom }) => `${level},${left},${right},${top},${bottom}`)
      .join(';');
    const previous = entries.get(placement);
    if (previous?.signature === signature) {
      for (const tile of previous.tiles) tile.priority = imageTilePriority(image, region, tile);
      return previous.tiles;
    }
    if (previous) {
      size -= previous.tiles.length;
      entries.delete(placement);
    }
    const tiles = imageTiles(image, region);
    if (tiles.length <= maxTiles) {
      while (size + tiles.length > maxTiles || entries.size >= 4096) {
        const first = entries.keys().next().value;
        if (first === undefined) break;
        size -= entries.get(first)!.tiles.length;
        entries.delete(first);
      }
      entries.set(placement, { signature, tiles });
      size += tiles.length;
    }
    return tiles;
  };
}

function imageTileRanges(image: VirtualImage, region: NonNullable<ReturnType<typeof visibleImage>>) {
  // Ignore a constant one-texel axis when selecting the required image detail.
  const ratio = Math.min(
    image.width === 1 ? Infinity : image.width / Math.max(1, region.width),
    image.height === 1 ? Infinity : image.height / Math.max(1, region.height)
  );
  const level = Math.min(image.level, Math.max(0, Math.floor(Math.log2(ratio))));
  const ranges: { level: number; left: number; right: number; top: number; bottom: number }[] = [];
  for (let l = image.level - 1; l >= level; l--) {
    const width = mipSize(image.width, l);
    const height = mipSize(image.height, l);
    ranges.push({
      level: l,
      left: Math.max(0, Math.floor((region.left * width) / tileSize)),
      right: Math.min(Math.ceil(width / tileSize), Math.ceil((region.right * width) / tileSize)),
      top: Math.max(0, Math.floor((region.top * height) / tileSize)),
      bottom: Math.min(Math.ceil(height / tileSize), Math.ceil((region.bottom * height) / tileSize))
    });
  }
  return ranges;
}

function imageTilePriority(image: VirtualImage, region: NonNullable<ReturnType<typeof visibleImage>>, tile: Tile) {
  return (
    (image.level - tile.level) * 100 +
    region.distance +
    Math.hypot(
      ((tile.x + 0.5) * tileSize) / mipSize(image.width, tile.level) - (region.left + region.right) / 2,
      ((tile.y + 0.5) * tileSize) / mipSize(image.height, tile.level) - (region.top + region.bottom) / 2
    )
  );
}

/** Stable CPU key, independent of atlas placement. */
export function tileKey(tile: Tile) {
  return `${tile.image}:${tile.level}:${tile.x}:${tile.y}`;
}

/** Packed address shared with the shader; validated images are at most 65,535 pixels per axis. */
export function tileAddress(tile: Tile) {
  return (tile.level * 512 + tile.y) * 512 + tile.x;
}

/** Unsigned hash arithmetic matches WGSL's wrapping u32 multiplication. */
export function tileHash(image: number, address: number) {
  return (Math.imul(image + 1, 2654435761) ^ Math.imul(address, 2246822519)) & (lookupSize - 1);
}

/** Dimension of a floor-sized mip, including narrow images. */
export function mipSize(size: number, level: number) {
  return Math.max(1, Math.floor(size / 2 ** level));
}

/** Terminal 1x1 mip index. */
export function lastLevel(width: number, height: number) {
  return Math.floor(Math.log2(Math.max(width, height)));
}

/** Tile interior; one neighboring texel on each edge supports bilinear filtering without seams. */
export const tileSize = 128;
export const tileExtent = tileSize + 2;
/** Physical detail atlas stays below 64 MiB. The mip-tail atlas has a separate 16 MiB ceiling. */
export const atlasColumns = 31;
export const tileCapacity = atlasColumns ** 2;
export const lookupSize = 8192;
