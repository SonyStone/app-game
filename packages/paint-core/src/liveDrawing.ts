import { TILE_SIZE } from './brush';
import type { Layer, LayerInfo, TileChange } from './document';
import type { DocumentRect } from './layersInView';
import { compressTile, restoreTile } from './tileCodec';
import type { TileData, TileReference } from './tilePixels';

/**
 * The drawing as a live session's author shares it: its layers and, for a region such as the author's view, the
 * version of every tile there. A version names immutable pixels, so a viewer that has it needs nothing more; the
 * author sends viewers only versions they lack, read with {@link readLiveTiles}.
 */
export type LiveListing = {
  layers: LayerInfo[];
  activeId: string;
  linearBlending: boolean;
  /** The tiles in the region, nearest to its center first. */
  tiles: LiveTileVersion[];
  /** Whether the region held more tiles than were listed. */
  truncated: boolean;
};

/** A tile and the version of its pixels. */
export type LiveTileVersion = { layerId: string; key: string; version: string };

/** A version's pixels, compressed for the wire as storage keeps them (`compressTile`). */
export type LiveTileBytes = { version: string; bytes: Uint8Array };

/**
 * What a viewer applies: the author's layers, and tiles of them that changed, with their compressed pixels or `null`
 * for a tile that was cleared. Tiles not listed stay as the viewer has them.
 */
export type LiveState = {
  layers: LayerInfo[];
  activeId: string;
  linearBlending: boolean;
  tiles: { layerId: string; key: string; bytes: Uint8Array | null }[];
};

/**
 * Lists `layers` and their tiles that touch `region`, at most `limit` of them, nearest to the region's center first.
 * `capture` names each tile's pixels, as storage does (`PaintStorage.capture`). Returns the listing and the tile data
 * by version, for reading them.
 */
export function listLiveTiles(
  document: { layers: readonly Layer[]; activeId: string; linearBlending: boolean },
  region: DocumentRect,
  capture: (pixels: TileData) => TileReference,
  limit: number
): { listing: LiveListing; versions: Map<string, TileData> } {
  const left = Math.floor(region.left / TILE_SIZE),
    top = Math.floor(region.top / TILE_SIZE),
    right = Math.floor((region.left + region.width) / TILE_SIZE),
    bottom = Math.floor((region.top + region.height) / TILE_SIZE);
  const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const found: (LiveTileVersion & { distance: number; data: TileData })[] = [];
  for (const layer of document.layers) {
    for (const [key, data] of layer.tiles) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      if (x < left || x > right || y < top || y > bottom) {
        continue;
      }

      found.push({
        layerId: layer.id,
        key,
        version: capture(data).storageId,
        distance: Math.hypot(x - center.x, y - center.y),
        data
      });
    }
  }

  found.sort((a, b) => a.distance - b.distance);
  const kept = found.slice(0, limit);
  return {
    listing: {
      layers: document.layers.map(({ tiles: _tiles, ...info }) => info),
      activeId: document.activeId,
      linearBlending: document.linearBlending,
      tiles: kept.map(({ layerId, key, version }) => ({ layerId, key, version })),
      truncated: found.length > kept.length
    },
    versions: new Map(kept.map(({ version, data }) => [version, data]))
  };
}

/** The compressed pixels of `wanted` versions among `versions`; versions not there are left out. */
export async function readLiveTiles(
  versions: ReadonlyMap<string, TileData>,
  wanted: readonly string[],
  read: (data: TileData) => Promise<Uint8Array>
): Promise<LiveTileBytes[]> {
  const tiles: LiveTileBytes[] = [];
  for (const version of wanted) {
    const data = versions.get(version);
    if (data) {
      tiles.push({ version, bytes: await compressTile(await read(data)) });
    }
  }

  return tiles;
}

/**
 * The layers after applying `state` to `layers`: the author's layers in the author's order, each keeping the tiles it
 * had unless `state` changes them; layers the author no longer has are gone. Returns them with the tile changes, for
 * the renderer to reload, and the ids of removed layers, for it to release.
 */
export async function applyLiveState(
  layers: readonly Layer[],
  state: LiveState
): Promise<{ layers: Layer[]; changes: TileChange[]; removed: string[] }> {
  const previous = new Map(layers.map((layer) => [layer.id, layer]));
  const next = state.layers.map((info) => ({ ...info, tiles: new Map(previous.get(info.id)?.tiles) }));
  const byId = new Map(next.map((layer) => [layer.id, layer]));
  const changes: TileChange[] = [];
  for (const tile of state.tiles) {
    const layer = byId.get(tile.layerId);
    if (!layer) {
      continue;
    }

    const before = layer.tiles.get(tile.key);
    const after = tile.bytes ? await restoreTile(tile.bytes) : undefined;
    if (after) {
      layer.tiles.set(tile.key, after);
    } else {
      layer.tiles.delete(tile.key);
    }

    changes.push({ layerId: layer.id, key: tile.key, before, after });
  }

  return { layers: next, changes, removed: layers.filter((layer) => !byId.has(layer.id)).map(({ id }) => id) };
}
