import { TILE_SIZE } from './brush';
import type { Point } from './camera';
import type { Layer } from './document';
import { unpackTile, type TileData } from './tilePixels';

/**
 * How a color is picked: from the presented view, all layers and the paper included (`view`), or from the committed
 * paint of the active layer (`layer`); averaged over a square of `size` pixels per side, CSS pixels of the view or
 * document pixels of the layer. `exact` commits a stroke in progress and, for the view, redraws it at full detail
 * first; without it the last presented frame is read, which is fast enough for a live preview.
 */
export type ColorSample = { source: 'view' | 'layer'; size: 1 | 3 | 5; exact: boolean };

/** Picks one pixel of the view at full detail, the behavior without sample options. */
export const defaultColorSample: ColorSample = { source: 'view', size: 1, exact: true };

/** The average of opaque RGBA pixels, such as presented ones, as `#rrggbb`. */
export function averageOpaque(data: ArrayLike<number>): string {
  const sum = [0, 0, 0];
  const count = data.length / 4;
  for (let index = 0; index < data.length; index += 4) {
    sum[0]! += data[index]!;
    sum[1]! += data[index + 1]!;
    sum[2]! += data[index + 2]!;
  }

  return toHex(sum.map((channel) => channel / count));
}

/**
 * The color of `layer`'s paint around a document point, averaged over `size` × `size` document pixels and weighted
 * by coverage, as `#rrggbb`; `null` where the layer has no paint. Tiles hold premultiplied sRGB, so the averaged color
 * is divided by the averaged alpha.
 */
export async function sampleLayer(
  layer: Layer,
  point: Point,
  size: number,
  readTile: (pixels: TileData) => Promise<Uint8Array>
): Promise<string | null> {
  const left = Math.floor(point.x) - Math.floor(size / 2),
    top = Math.floor(point.y) - Math.floor(size / 2);
  const sum = [0, 0, 0, 0];
  const tiles = new Map<string, Uint8Array | undefined>();
  for (let y = top; y < top + size; y++) {
    for (let x = left; x < left + size; x++) {
      const key = `${Math.floor(x / TILE_SIZE)},${Math.floor(y / TILE_SIZE)}`;
      if (!tiles.has(key)) {
        const data = layer.tiles.get(key);
        tiles.set(key, data && unpackTile(await readTile(data)));
      }

      const pixels = tiles.get(key);
      if (!pixels) {
        continue;
      }

      const offset =
        ((y - Math.floor(y / TILE_SIZE) * TILE_SIZE) * TILE_SIZE + x - Math.floor(x / TILE_SIZE) * TILE_SIZE) * 4;
      for (let channel = 0; channel < 4; channel++) {
        sum[channel]! += pixels[offset + channel]!;
      }
    }
  }

  if (!sum[3]) {
    return null;
  }

  return toHex(sum.slice(0, 3).map((channel) => (channel / sum[3]!) * 255));
}

/** `#rrggbb` of channel values from 0 to 255, rounded and clamped. */
function toHex(channels: readonly number[]) {
  return `#${channels
    .map((channel) =>
      Math.min(255, Math.max(0, Math.round(channel)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}
