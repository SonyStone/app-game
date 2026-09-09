import { TILE_SIZE } from './brush';
import type { Point } from './camera';
import type { Layer, TileChange } from './document';
import { packTile, TILE_BYTES, unpackTile, type TileData } from './tilePixels';

/** Session-only clipboard. Immutable tile versions may be evicted from RAM and read back from disk. */
export type SelectionPixels = { points: Point[]; tiles: Map<string, TileData> };
/** Stages immutable pixels without publishing a document checkpoint. Production writes flush bounded batches. */
export type SelectionStorage = {
  read: (data: TileData) => Promise<Uint8Array>;
  write: (pixels: Uint8Array) => Promise<TileData>;
};

/** Captures occupied pixels with an even-odd pixel-center mask, including concave and crossing paths.
 * Stages each result immediately; memory does not grow with the selected area. Failed reads/writes leave the document intact.
 */
export async function captureSelection(layer: Layer, points: Point[], storage: SelectionStorage) {
  validatePolygon(points);
  const bounds = polygonBounds(points);
  const candidates = [...layer.tiles]
    .map(([key, data]) => ({ key, data, origin: tileOrigin(key) }))
    .filter(
      ({ origin: [x, y] }) =>
        x < bounds.right && x + TILE_SIZE > bounds.left && y < bounds.bottom && y + TILE_SIZE > bounds.top
    )
    .sort((a, b) => a.origin[1] - b.origin[1] || a.origin[0] - b.origin[0]);
  const tiles = new Map<string, TileData>();
  let bandY = NaN;
  let rows: number[][] = [];
  const yieldWork = workYield();
  for (const {
    key,
    data,
    origin: [ox, oy]
  } of candidates) {
    if (oy !== bandY) {
      rows = Array.from({ length: TILE_SIZE }, (_, y) => scanline(points, oy + y + 0.5));
      bandY = oy;
    }
    if (
      !rows.some((crossings) => crossings.some((x, i) => i % 2 === 0 && x < ox + TILE_SIZE && crossings[i + 1]! > ox))
    )
      continue;
    const source = unpackTile(await storage.read(data));
    const pixels = new Uint8Array(TILE_BYTES);
    let occupied = false;
    for (let y = 0; y < TILE_SIZE; y++) {
      const crossings = rows[y]!;
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const start = Math.max(0, Math.ceil(crossings[i]! - ox - 0.5));
        const end = Math.min(TILE_SIZE, Math.ceil(crossings[i + 1]! - ox - 0.5));
        for (let x = start; x < end; x++) {
          const at = (y * TILE_SIZE + x) * 4;
          if (!source[at + 3]) continue;
          pixels.set(source.subarray(at, at + 4), at);
          occupied = true;
        }
      }
    }
    if (occupied) tiles.set(key, await storage.write(packTile(pixels)));
    await yieldWork();
  }
  if (!tiles.size) throw new Error('The selection contains no pixels on the active layer.');
  return { points: points.map((point) => ({ ...point })), tiles } satisfies SelectionPixels;
}

/** Prepares a cut, paste, or move one destination tile at a time, including overlapping moves.
 * Results are immutable staged versions, committed together by the caller. Integer translation preserves bytes;
 * compositing uses premultiplied sRGB source-over. Only tile metadata grows with the edit.
 */
export async function editSelection(options: {
  selection: SelectionPixels;
  source?: Layer;
  destination?: Layer;
  offset?: Point;
  storage: SelectionStorage;
}): Promise<TileChange[]> {
  const { selection, source, destination, storage } = options;
  const dx = Math.round(options.offset?.x ?? 0),
    dy = Math.round(options.offset?.y ?? 0);
  if (!Number.isSafeInteger(dx) || !Number.isSafeInteger(dy)) throw new Error('Invalid selection offset.');
  const edits = new Map<string, { layer: Layer; key: string; erase: boolean; inputs: string[] }>();
  const plan = (layer: Layer, key: string) => {
    const id = `${layer.id}/${key}`;
    let edit = edits.get(id);
    if (!edit) {
      edit = { layer, key, erase: false, inputs: [] };
      edits.set(id, edit);
    }
    return edit;
  };
  if (source) for (const key of selection.tiles.keys()) plan(source, key).erase = true;
  if (destination)
    for (const key of selection.tiles.keys()) {
      const [ox, oy] = tileOrigin(key);
      for (let ty = Math.floor((oy + dy) / TILE_SIZE); ty <= Math.floor((oy + dy + TILE_SIZE - 1) / TILE_SIZE); ty++)
        for (let tx = Math.floor((ox + dx) / TILE_SIZE); tx <= Math.floor((ox + dx + TILE_SIZE - 1) / TILE_SIZE); tx++)
          plan(destination, `${tx},${ty}`).inputs.push(key);
    }
  const changes: TileChange[] = [];
  const yieldWork = workYield();
  for (const { layer, key, erase, inputs } of edits.values()) {
    const before = layer.tiles.get(key);
    const pixels = before ? unpackTile(await storage.read(before)).slice() : new Uint8Array(TILE_BYTES);
    let touched = false;
    if (erase) {
      const mask = unpackTile(await storage.read(selection.tiles.get(key)!));
      for (let at = 0; at < TILE_BYTES; at += 4)
        if (mask[at + 3]) {
          pixels.fill(0, at, at + 4);
          touched = true;
        }
    }
    const [ox, oy] = tileOrigin(key);
    for (const input of inputs) {
      const selected = unpackTile(await storage.read(selection.tiles.get(input)!));
      const [sx, sy] = tileOrigin(input);
      const left = Math.max(ox, sx + dx),
        right = Math.min(ox + TILE_SIZE, sx + dx + TILE_SIZE);
      const top = Math.max(oy, sy + dy),
        bottom = Math.min(oy + TILE_SIZE, sy + dy + TILE_SIZE);
      for (let y = top; y < bottom; y++)
        for (let x = left; x < right; x++) {
          const from = ((y - sy - dy) * TILE_SIZE + x - sx - dx) * 4;
          const alpha = selected[from + 3]!;
          if (!alpha) continue;
          const to = ((y - oy) * TILE_SIZE + x - ox) * 4;
          for (let c = 0; c < 4; c++)
            pixels[to + c] = Math.round(selected[from + c]! + pixels[to + c]! * (1 - alpha / 255));
          touched = true;
        }
    }
    if (touched)
      changes.push({
        layerId: layer.id,
        key,
        before,
        after: pixels.some((byte) => byte !== 0) ? await storage.write(packTile(pixels)) : undefined
      });
    await yieldWork();
  }
  return changes;
}

/** Even-odd hit testing in document coordinates; shared by the lasso and move interaction. */
export function pointInSelection(point: Point, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!,
      b = points[j]!;
    if (a.y > point.y !== b.y > point.y && point.x < a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y))
      inside = !inside;
  }
  return inside;
}

/** Translates the polygon by whole document pixels, matching the raster edit. */
export function translateSelection(points: readonly Point[], offset: Point): Point[] {
  return points.map((point) => ({ x: point.x + Math.round(offset.x), y: point.y + Math.round(offset.y) }));
}

function validatePolygon(points: Point[]) {
  if (
    points.length < 3 ||
    points.length > 4096 ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e12 || Math.abs(p.y) > 1e12)
  )
    throw new Error('Draw a closed lasso with at least three points.');
}
function polygonBounds(points: Point[]) {
  return {
    left: Math.min(...points.map((p) => p.x)),
    right: Math.max(...points.map((p) => p.x)),
    top: Math.min(...points.map((p) => p.y)),
    bottom: Math.max(...points.map((p) => p.y))
  };
}
function tileOrigin(key: string): [number, number] {
  const [x, y] = key.split(',').map(Number);
  return [x! * TILE_SIZE, y! * TILE_SIZE];
}
function scanline(points: Point[], y: number) {
  const crossings: number[] = [];
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!,
      b = points[j]!;
    if (a.y > y !== b.y > y) crossings.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
  }
  return crossings.sort((a, b) => a - b);
}
/** Yield on elapsed CPU time instead of paying a timer delay for every sparse tile. */
function workYield() {
  let deadline = performance.now() + 8;
  return async () => {
    if (performance.now() < deadline) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    deadline = performance.now() + 8;
  };
}
