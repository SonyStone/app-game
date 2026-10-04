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
  const left = Math.floor(Math.min(...corners.map(({ x }) => x)) / TILE_SIZE),
    right = Math.floor(Math.max(...corners.map(({ x }) => x)) / TILE_SIZE);
  const top = Math.floor(Math.min(...corners.map(({ y }) => y)) / TILE_SIZE),
    bottom = Math.floor(Math.max(...corners.map(({ y }) => y)) / TILE_SIZE);
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
