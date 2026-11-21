import { TILE_SIZE } from './brush';
import { planes, type DocumentNode, type GroupInfo, type Layer, type RasterInfo, type TileChange } from './document';
import { coverageTile, unpackMaskTile } from './layerMask';
import type { DocumentRect } from './layersInView';
import { isFlatStack, type ShownLayer } from './layerTree';
import { compressTile, restoreTile } from './tileCodec';
import type { TileData, TileReference } from './tilePixels';

/**
 * The drawing as a live session's author shares it: its layers and, for a region such as the author's view, the
 * version of every tile there. A version names immutable pixels, so a viewer that has it needs nothing more; the
 * author sends viewers only versions they lack, read with {@link readLiveTiles}.
 */
export type LiveListing = {
  /** The layers as a viewer shows them; see {@link listLiveTiles}. */
  layers: LiveLayer[];
  activeId: string;
  linearBlending: boolean;
  /** The tiles in the region, nearest to its center first. */
  tiles: LiveTileVersion[];
  /** Whether the region held more tiles than were listed. */
  truncated: boolean;
};

/**
 * A layer of a live drawing: a raster layer, at the root of a flat drawing or naming its folder, or a folder; either
 * with its mask's properties, whose tiles are listed by mask id.
 */
export type LiveLayer = RasterInfo | GroupInfo;

/** A tile of a plane, a layer's pixels or a mask's coverage (see `TileChange`), and the version of its pixels. */
export type LiveTileVersion = { layerId: string; key: string; version: string };

/** A version's pixels, compressed for the wire as storage keeps them (`compressTile`). */
export type LiveTileBytes = { version: string; bytes: Uint8Array };

/**
 * What a viewer applies: the author's layers, and tiles of them that changed, with their compressed pixels or `null`
 * for a tile that was cleared. Tiles not listed stay as the viewer has them.
 */
export type LiveState = {
  layers: LiveLayer[];
  activeId: string;
  linearBlending: boolean;
  tiles: { layerId: string; key: string; bytes: Uint8Array | null }[];
};

/**
 * Lists `layers` and their tiles that touch `region`, at most `limit` of them, nearest to the region's center first.
 * `layers` are the raster layers as they show (see `createDocument`'s `layers`). When they composite as a flat stack
 * (`isFlatStack`), folders are not shared: the layers are listed at the root, as they show, so a viewer gets a flat
 * drawing that looks the same. Otherwise a flat drawing cannot look the same, and the listing holds the layer tree,
 * `nodes`, with every node's own properties, which the viewer composites as the author does.
 * `capture` names each tile's pixels, as storage does (`PaintStorage.capture`). Returns the listing and the tile data
 * by version, for reading them.
 */
export function listLiveTiles(
  document: {
    layers: readonly ShownLayer[];
    nodes: readonly DocumentNode[];
    activeId: string;
    linearBlending: boolean;
  },
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
  const flat = isFlatStack(document.layers);
  // A flat listing shares only the rasters' masks; a tree shares the folders' too.
  for (const [layerId, tiles] of planes(flat ? document.layers : document.nodes)) {
    for (const [key, data] of tiles) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      if (x < left || x > right || y < top || y > bottom) {
        continue;
      }

      found.push({
        layerId,
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
      layers: flat
        ? document.layers.map(
            ({ tiles: _tiles, parentId: _parentId, group: _group, clipGroup: _clip, mask, ...info }) =>
              mask ? { ...info, mask: liveMask(mask) } : info
          )
        : document.nodes.map((node) => {
            const mask = node.mask && liveMask(node.mask);
            if (node.kind === 'group') {
              const { mask: _mask, ...group } = node;
              return mask ? { ...group, mask } : group;
            }

            const { tiles: _tiles, mask: _mask, ...info } = node;
            return mask ? { ...info, mask } : info;
          }),
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
 * The layers after applying `state` to `layers`, the viewer's nodes: the author's layers, and folders when the author
 * shares them, in the author's order, each raster and mask keeping the tiles it had unless `state` changes them;
 * layers the author no longer has are gone. Returns them with the tile changes, for the renderer to reload, and the ids of removed layers, for it to
 * release.
 */
export async function applyLiveState(
  layers: readonly DocumentNode[],
  state: LiveState
): Promise<{ layers: DocumentNode[]; changes: TileChange[]; removed: string[] }> {
  const previous = planes(layers);
  const next = state.layers.map((info): DocumentNode => {
    const mask = info.mask && { ...info.mask, tiles: new Map(previous.get(info.mask.id)) };
    const node = mask ? { ...info, mask } : { ...info, mask: undefined };
    if (!mask) {
      delete node.mask;
    }

    return info.kind === 'group'
      ? (node as DocumentNode)
      : ({ ...node, tiles: new Map(previous.get(info.id)) } as DocumentNode);
  });
  const byPlane = planes(next);
  const outsides = new Map(next.flatMap((node) => (node.mask ? [[node.mask.id, node.mask.outside] as const] : [])));
  const changes: TileChange[] = [];
  for (const tile of state.tiles) {
    const tiles = byPlane.get(tile.layerId);
    if (!tiles) {
      continue;
    }

    const before = tiles.get(tile.key);
    const outside = outsides.get(tile.layerId);
    const restored = tile.bytes ? await restoreTile(tile.bytes) : undefined;
    // Coverage of a mask is validated as one; a tile of only `outside` coverage needs none.
    const after = restored && outside !== undefined ? coverageTile(unpackMaskTile(restored), outside) : restored;
    if (after) {
      tiles.set(tile.key, after);
    } else {
      tiles.delete(tile.key);
    }

    changes.push({ layerId: tile.layerId, key: tile.key, before, after });
  }

  const kept = new Set(next.filter((node) => node.kind !== 'group').map(({ id }) => id));
  const removed = layers.filter((layer) => layer.kind !== 'group' && !kept.has(layer.id)).map(({ id }) => id);
  return { layers: next, changes, removed };
}

/** A mask's properties as a live listing shares them. */
function liveMask({ tiles: _tiles, ...mask }: NonNullable<Layer['mask']>) {
  return mask;
}
