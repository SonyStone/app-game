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
export function visibleImage(records: DataView, index: number, frame: SceneFrame) {
  const offset = index * 80;
  const page = frame.visible.find(({ index: page }) => page === records.getUint32(offset + 76, true))?.page;
  const m = frame.rotation;
  const project = (u: number, v: number) => {
    const px =
      records.getFloat32(offset + 16, true) +
      records.getFloat32(offset, true) * u +
      records.getFloat32(offset + 8, true) * v;
    const py =
      records.getFloat32(offset + 20, true) +
      records.getFloat32(offset + 4, true) * u +
      records.getFloat32(offset + 12, true) * v;
    const x = (px - (page?.x ?? 0)) * frame.mul[0] + frame.add[0];
    const y = (1 - py - (page?.y ?? 0)) * frame.mul[1] + frame.add[1];
    return [m[0]! * x + m[2]! * y, m[1]! * x + m[3]! * y];
  };
  const p = project(0, 0);
  const u = project(1, 0).map((v, i) => v - p[i]!);
  const v = project(0, 1).map((v, i) => v - p[i]!);
  const determinant = u[0]! * v[1]! - u[1]! * v[0]!;

  if (Math.abs(determinant) < 1e-20) {
    return undefined;
  }

  const corners = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ].map(([x, y]) => {
    const dx = x! - p[0]!;
    const dy = y! - p[1]!;
    return [(dx * v[1]! - dy * v[0]!) / determinant, (dy * u[0]! - dx * u[1]!) / determinant];
  });
  const left = Math.max(0, Math.min(...corners.map((p) => p[0]!)));
  const right = Math.min(1, Math.max(...corners.map((p) => p[0]!)));
  const top = Math.max(0, Math.min(...corners.map((p) => p[1]!)));
  const bottom = Math.min(1, Math.max(...corners.map((p) => p[1]!)));

  if (left >= right || top >= bottom) {
    return undefined;
  }

  return {
    left,
    right,
    top,
    bottom,
    width: Math.hypot((u[0]! * frame.width) / 2, (u[1]! * frame.height) / 2),
    height: Math.hypot((v[0]! * frame.width) / 2, (v[1]! * frame.height) / 2),
    distance: Math.hypot(p[0]! + (u[0]! + v[0]!) / 2, p[1]! + (u[1]! + v[1]!) / 2)
  };
}

/** Candidate tiles ordered from coarse coverage to detail, then by distance from the visible image center. */
export function imageTiles(image: VirtualImage, region: NonNullable<ReturnType<typeof visibleImage>>) {
  // A single texel is constant along that axis. Stretching a 4096x1 color ramp
  // vertically must not request all its high-resolution columns and evict photos.
  const ratio = Math.min(
    image.width === 1 ? Infinity : image.width / Math.max(1, region.width),
    image.height === 1 ? Infinity : image.height / Math.max(1, region.height)
  );
  const level = Math.min(image.level, Math.max(0, Math.floor(Math.log2(ratio))));
  const tiles: (Tile & { priority: number })[] = [];

  for (let l = image.level - 1; l >= level; l--) {
    const width = mipSize(image.width, l);
    const height = mipSize(image.height, l);
    const left = Math.max(0, Math.floor((region.left * width) / tileSize));
    const top = Math.max(0, Math.floor((region.top * height) / tileSize));
    const right = Math.min(Math.ceil(width / tileSize), Math.ceil((region.right * width) / tileSize));
    const bottom = Math.min(Math.ceil(height / tileSize), Math.ceil((region.bottom * height) / tileSize));

    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        tiles.push({
          image: image.id,
          level: l,
          x,
          y,
          priority:
            (image.level - l) * 100 +
            region.distance +
            Math.hypot(
              ((x + 0.5) * tileSize) / width - (region.left + region.right) / 2,
              ((y + 0.5) * tileSize) / height - (region.top + region.bottom) / 2
            )
        });
      }
    }
  }

  return tiles;
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
