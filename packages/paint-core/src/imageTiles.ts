import { TILE_SIZE } from './brush';
import type { Point, ViewSize } from './camera';
import { TILE_BYTES } from './tilePixels';

/**
 * Where a placed image goes: centered on `center`, at one image pixel per document pixel, scaled down to fit `fit` and
 * `maxSide` but never enlarged. The top-left corner snaps to whole document pixels so tiles need no resampling.
 */
export function placeImage(width: number, height: number, center: Point, fit: ViewSize, maxSide = 4096) {
  const scale = Math.min(1, fit.width / width, fit.height / height, maxSide / width, maxSide / height);
  const placedWidth = Math.max(1, Math.round(width * scale));
  const placedHeight = Math.max(1, Math.round(height * scale));
  return {
    left: Math.round(center.x - placedWidth / 2),
    top: Math.round(center.y - placedHeight / 2),
    width: placedWidth,
    height: placedHeight
  };
}

/**
 * Cuts straight-alpha sRGB RGBA pixels, such as `ImageData`, placed with their top-left corner at document pixel
 * (`left`, `top`) into the document's premultiplied tiles, keyed `"x,y"`. Fully transparent tiles are omitted.
 */
export function imageTiles(pixels: Uint8ClampedArray, width: number, height: number, left: number, top: number) {
  const tiles = new Map<string, Uint8Array>();
  for (let ty = Math.floor(top / TILE_SIZE); ty * TILE_SIZE < top + height; ty++) {
    for (let tx = Math.floor(left / TILE_SIZE); tx * TILE_SIZE < left + width; tx++) {
      const tile = new Uint8Array(TILE_BYTES);
      let covered = false;
      const x0 = Math.max(left, tx * TILE_SIZE),
        x1 = Math.min(left + width, (tx + 1) * TILE_SIZE);
      const y0 = Math.max(top, ty * TILE_SIZE),
        y1 = Math.min(top + height, (ty + 1) * TILE_SIZE);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const from = ((y - top) * width + (x - left)) * 4;
          const alpha = pixels[from + 3]!;
          if (!alpha) {
            continue;
          }

          const to = ((y - ty * TILE_SIZE) * TILE_SIZE + (x - tx * TILE_SIZE)) * 4;
          tile[to] = Math.round((pixels[from]! * alpha) / 255);
          tile[to + 1] = Math.round((pixels[from + 1]! * alpha) / 255);
          tile[to + 2] = Math.round((pixels[from + 2]! * alpha) / 255);
          tile[to + 3] = alpha;
          covered = true;
        }
      }

      if (covered) {
        tiles.set(`${tx},${ty}`, tile);
      }
    }
  }

  return tiles;
}
