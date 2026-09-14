import { TILE_SIZE } from '../brush';
import type { Layer } from '../document';

/** Selects touched tiles inside a redraw region without scanning an entire long stroke.
 * A streamed layer supplies committed pixels separately. Active snapshots and optional
 * preview tails still replace them. Boundary-touching tiles remain included.
 */
export function visibleTileKeys(
  layer: Pick<Layer, 'id' | 'tiles'>,
  active: ReadonlyMap<string, unknown> | undefined,
  tail: ReadonlyMap<string, unknown> | undefined,
  streamed: boolean,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): string[] {
  const left = Math.ceil(bounds.minX / TILE_SIZE) - 1;
  const right = Math.floor(bounds.maxX / TILE_SIZE);
  const top = Math.ceil(bounds.minY / TILE_SIZE) - 1;
  const bottom = Math.floor(bounds.maxY / TILE_SIZE);
  const count = (streamed ? 0 : layer.tiles.size) + (active?.size ?? 0) + (tail?.size ?? 0);
  const prefix = `${layer.id}/`;
  const result: string[] = [];
  if ((right - left + 1) * (bottom - top + 1) < count) {
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        const key = `${x},${y}`;
        if ((!streamed && layer.tiles.has(key)) || active?.has(prefix + key) || tail?.has(key)) result.push(key);
      }
    return result;
  }
  // Wide views of sparse artwork are cheaper to enumerate by occupied tiles.
  const keys = new Set(streamed ? [] : layer.tiles.keys());
  if (active) for (const id of active.keys()) keys.add(id.slice(prefix.length));
  if (tail) for (const key of tail.keys()) keys.add(key);
  for (const key of keys) {
    const separator = key.indexOf(',');
    const x = Number(key.slice(0, separator));
    const y = Number(key.slice(separator + 1));
    if (x >= left && x <= right && y >= top && y <= bottom) result.push(key);
  }
  return result;
}
