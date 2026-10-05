import { TILE_SIZE } from './brush';
import type { Point } from './camera';
import type { Layer, TileChange } from './document';
import { tileCoverage, type SelectionMask } from './selectionMask';
import { packTile, TILE_BYTES, unpackTile, type TileData } from './tilePixels';

/**
 * Session-only clipboard: the selected pixels, already scaled by the selection's coverage, and the selection they
 * were taken with. Immutable tile versions may be evicted from RAM and read back from disk.
 */
export type SelectionPixels = { mask: SelectionMask; tiles: Map<string, TileData> };
/** Stages immutable pixels without publishing a document checkpoint. Production writes flush bounded batches. */
export type SelectionStorage = {
  read: (data: TileData) => Promise<Uint8Array>;
  write: (pixels: Uint8Array) => Promise<TileData>;
};

/**
 * Captures the active layer's pixels in the selection `mask`, each scaled by its coverage, so a feathered edge fades.
 * Stages each result immediately; memory does not grow with the selected area. Failed reads/writes leave the document
 * intact. Throws when the selection holds no pixels of the layer.
 */
export async function captureSelection(layer: Layer, mask: SelectionMask, storage: SelectionStorage) {
  const candidates = [...layer.tiles]
    .filter(([key]) => mask.outside === 255 || mask.tiles.has(key))
    .sort(([a], [b]) => {
      const [ax, ay] = tileOrigin(a),
        [bx, by] = tileOrigin(b);
      return ay - by || ax - bx;
    });
  const tiles = new Map<string, TileData>();
  const yieldWork = workYield();
  for (const [key, data] of candidates) {
    const [tx, ty] = tileOrigin(key).map((origin) => origin / TILE_SIZE) as [number, number];
    const coverage = tileCoverage(mask, tx, ty);
    if (coverage.kind === 'outside') {
      continue;
    }

    const source = unpackTile(await storage.read(data));
    const pixels = coverage.kind === 'inside' ? source.slice() : new Uint8Array(TILE_BYTES);
    if (coverage.kind === 'partial') {
      for (let pixel = 0; pixel < TILE_SIZE * TILE_SIZE; pixel++) {
        const amount = coverage.coverage[pixel]!;
        const at = pixel * 4;
        if (!amount || !source[at + 3]) {
          continue;
        }

        for (let channel = 0; channel < 4; channel++) {
          pixels[at + channel] = Math.round((source[at + channel]! * amount) / 255);
        }
      }
    }

    if (pixels.some((byte, index) => index % 4 === 3 && byte !== 0)) {
      tiles.set(key, await storage.write(packTile(pixels)));
    }

    await yieldWork();
  }

  if (!tiles.size) throw new Error('The selection contains no pixels on the active layer.');
  return { mask, tiles } satisfies SelectionPixels;
}

/** Prepares a cut, paste, or move one destination tile at a time, including overlapping moves.
 * Results are immutable staged versions, committed together by the caller. The source loses the selected pixels in
 * proportion to the selection's coverage; integer translation preserves bytes; compositing uses premultiplied sRGB
 * source-over. Only tile metadata grows with the edit.
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
      const [ex, ey] = tileOrigin(key);
      const coverage = tileCoverage(selection.mask, ex / TILE_SIZE, ey / TILE_SIZE);
      for (let at = 0; at < TILE_BYTES; at += 4) {
        const amount = coverage.kind === 'partial' ? coverage.coverage[at / 4]! : coverage.kind === 'inside' ? 255 : 0;
        if (!amount || !pixels[at + 3]) {
          continue;
        }

        for (let channel = 0; channel < 4; channel++) {
          pixels[at + channel] = Math.round((pixels[at + channel]! * (255 - amount)) / 255);
        }

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

function tileOrigin(key: string): [number, number] {
  const [x, y] = key.split(',').map(Number);
  return [x! * TILE_SIZE, y! * TILE_SIZE];
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
