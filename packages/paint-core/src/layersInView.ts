import { TILE_SIZE } from './brush';
import { screenToWorld, type Camera, type ViewSize } from './camera';
import type { Layer } from './document';

/**
 * Ids of the layers with any tile in the view of `camera` at `size`, in layer order. The view's bounding box in
 * document space is tested, so a rotated view also counts tiles just outside its corners.
 */
export function layersInView(layers: readonly Pick<Layer, 'id' | 'tiles'>[], camera: Camera, size: ViewSize): string[] {
  const corners = [
    { x: 0, y: 0 },
    { x: size.width, y: 0 },
    { x: 0, y: size.height },
    { x: size.width, y: size.height }
  ].map((corner) => screenToWorld(corner, camera, size));
  const left = Math.min(...corners.map(({ x }) => x)),
    top = Math.min(...corners.map(({ y }) => y));
  return layersInRect(layers, {
    left,
    top,
    width: Math.max(...corners.map(({ x }) => x)) - left,
    height: Math.max(...corners.map(({ y }) => y)) - top
  });
}

/** Ids of the layers with any tile overlapping `rect`, in document pixels, in layer order. */
export function layersInRect(layers: readonly Pick<Layer, 'id' | 'tiles'>[], rect: DocumentRect): string[] {
  const left = Math.floor(rect.left / TILE_SIZE),
    right = Math.floor((rect.left + rect.width) / TILE_SIZE);
  const top = Math.floor(rect.top / TILE_SIZE),
    bottom = Math.floor((rect.top + rect.height) / TILE_SIZE);
  const area = (right - left + 1) * (bottom - top + 1);

  return layers
    .filter(({ tiles }) => {
      if (area < tiles.size) {
        for (let y = top; y <= bottom; y++) {
          for (let x = left; x <= right; x++) {
            if (tiles.has(`${x},${y}`)) {
              return true;
            }
          }
        }

        return false;
      }

      for (const key of tiles.keys()) {
        const separator = key.indexOf(',');
        const x = Number(key.slice(0, separator)),
          y = Number(key.slice(separator + 1));
        if (x >= left && x <= right && y >= top && y <= bottom) {
          return true;
        }
      }

      return false;
    })
    .map(({ id }) => id);
}

/** An axis-aligned rectangle in document pixels. */
export type DocumentRect = { left: number; top: number; width: number; height: number };
