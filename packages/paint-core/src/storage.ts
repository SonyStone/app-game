import type { RendererToolState } from '@app-game/abr-paint/gpu/toolState';
import { z } from 'zod';
import { TILE_SIZE } from './brush';
import type { Camera } from './camera';
import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_TILES,
  MAX_LAYERS,
  TILE_BYTES,
  type DocumentHistory,
  type DocumentNode,
  type Layer,
  type LayerGroup,
  type PsdDocumentIdentity
} from './document';
import { MAX_FOLDERS, orderLayerTree } from './layerTree';
import { packTile, unpackTile, type TileData, type TileReference } from './tilePixels';

/**
 * Versioned on-disk format. Tile pixels remain premultiplied; no lossy image conversion occurs. Versions 1 and 2 are
 * portable JSON with the pixels inline, version 3 a checkpoint whose pixels are stored tile versions; all three hold a
 * flat list of raster layers, which open at the root. Version 4, which `snapshotDocument` writes, holds the layer
 * tree: every entry of `layers` is a node marked by `kind`, a raster with its tiles or a folder without, in canonical
 * order (see `layerTree`); its pixels are inline or stored versions.
 */
export type SavedDocument = ReturnType<typeof snapshotDocument>;

/**
 * Copies metadata while sharing immutable committed tile snapshots. `nodes` is the layer tree, as `createDocument`'s
 * `nodes` has it; a flat list of raster layers is a tree without folders. `features` holds document feature data by
 * feature ID, including data of features this runtime does not have. Optional PSD identity survives subsequent
 * exports.
 */
export function snapshotDocument(
  nodes: readonly DocumentNode[],
  activeId: string,
  camera: Camera,
  features: Readonly<Record<string, unknown>> = {},
  linearBlending = true,
  psdIdentity?: PsdDocumentIdentity
) {
  return {
    version: 4 as const,
    ...(psdIdentity ? { psdIdentity: structuredClone(psdIdentity) } : {}),
    tileSize: TILE_SIZE,
    activeId,
    blending: linearBlending ? ('linear' as const) : ('classic' as const),
    camera: { ...camera },
    features: { ...features },
    layers: nodes.map(savedNode)
  };
}

/** A node as `snapshotDocument` saves it: a folder as it is, a raster with `kind` and its tiles as a list. */
function savedNode(node: DocumentNode) {
  if (node.kind === 'group') {
    return { ...node };
  }

  const { tiles, ...layer } = node;
  return { ...layer, kind: 'raster' as const, tiles: [...tiles].map(([key, pixels]) => ({ key, pixels })) };
}

/** A node of a {@link SavedDocument}. */
export type SavedNode = SavedDocument['layers'][number];

/**
 * The checkpoint of `snapshot` that storage keeps: the same version 4 document, each tile's pixels replaced by the
 * stored version `capture` names, so it holds no pixels.
 */
export function checkpointDocument(snapshot: SavedDocument, capture: (pixels: TileData) => TileReference) {
  return {
    ...snapshot,
    layers: snapshot.layers.map((node) =>
      node.kind === 'group'
        ? node
        : { ...node, tiles: node.tiles.map((tile) => ({ ...tile, pixels: capture(tile.pixels) })) }
    )
  };
}

/** The tile pixels or stored versions a saved document of any version refers to, from data read back from storage. */
export function* savedTiles(saved: unknown): Generator<unknown> {
  const layers = (saved as { layers?: unknown } | undefined)?.layers;
  for (const layer of Array.isArray(layers) ? (layers as { tiles?: unknown }[]) : []) {
    for (const tile of Array.isArray(layer?.tiles) ? (layer.tiles as { pixels?: unknown }[]) : []) {
      yield tile?.pixels;
    }
  }
}

/**
 * Validates imported/local data before replacing the current document. Feature data is returned unvalidated; each
 * feature validates its own. Documents saved before features existed store paint symmetry at the top level; it is
 * returned as the `symmetry` feature's data.
 *
 * Returns the layer tree in canonical order as `nodes`, and its raster layers, the same objects, as `layers`; a
 * document saved before folders opens with its layers at the root. Throws for a tree `orderLayerTree` refuses, one
 * without a raster layer, more than `MAX_LAYERS` layers or `MAX_FOLDERS` folders, and a folder with an opacity, blend
 * mode or clipping this version cannot show. A `portable` document, one read from a file rather than storage, must
 * hold its pixels inline and stay within the import budget.
 */
export function restoreDocument(
  value: unknown,
  portable = false
): {
  nodes: DocumentNode[];
  layers: Layer[];
  activeId: string;
  camera: Camera;
  features: Record<string, unknown>;
  linearBlending: boolean;
  psdIdentity?: PsdDocumentIdentity;
} {
  const parsed = savedSchema.parse(value);
  if (
    new Set(parsed.layers.map((l) => l.id)).size !== parsed.layers.length ||
    !parsed.layers.some((l) => l.id === parsed.activeId)
  )
    throw new Error('Invalid layer identifiers.');
  const entries: (LegacyLayer | SavedRaster | SavedGroup)[] = parsed.layers;
  const rasterEntries = entries.filter(
    (entry): entry is LegacyLayer | SavedRaster => !('kind' in entry) || entry.kind !== 'group'
  );
  if (!rasterEntries.length) throw new Error('A drawing needs at least one layer.');
  if (rasterEntries.length > MAX_LAYERS) throw new Error(`A drawing can contain at most ${MAX_LAYERS} layers.`);
  if (entries.length - rasterEntries.length > MAX_FOLDERS)
    throw new Error(`A drawing can contain at most ${MAX_FOLDERS} folders.`);
  /** Stored versions are allowed in checkpoints only; inline pixels count against the import budget. */
  const references = !portable && parsed.version >= 3;
  let bytes = 0,
    count = 0;
  const nodes = entries.map((entry): DocumentNode => {
    if ('kind' in entry && entry.kind === 'group') {
      return { ...entry };
    }

    const { kind: _kind, ...layer } = entry as SavedRaster;
    if (new Set(layer.tiles.map((t) => t.key)).size !== layer.tiles.length)
      throw new Error('Duplicate tile coordinates.');
    const tiles = new Map(
      layer.tiles.map((tile) => {
        if (parsed.version === 1 && tile.pixels.byteLength !== TILE_BYTES) throw new Error('Invalid tile length.');
        if (!references && !(tile.pixels instanceof Uint8Array)) throw new Error('Unexpected external tile reference.');
        const pixels = tile.pixels instanceof Uint8Array ? packTile(unpackTile(tile.pixels)) : tile.pixels;
        bytes += pixels.byteLength;
        if (++count > MAX_DOCUMENT_TILES) throw new Error('Too many tiles in this document.');
        if (!references && bytes > MAX_DOCUMENT_BYTES)
          throw new Error('This document exceeds the 256 MiB import limit.');
        return [tile.key, pixels] as const;
      })
    );
    // Smooth color layers become Normal ones in a document that blends in linear light.
    return { ...layer, blend: layer.blend === 'linear' ? ('normal' as const) : layer.blend, tiles };
  });
  const ordered = orderLayerTree(nodes);
  const legacy = parsed.symmetry === undefined ? {} : { symmetry: parsed.symmetry };
  // Documents saved before `blending` blend in linear light, unless no layer used Smooth color and one used Normal.
  const linearBlending =
    parsed.blending === undefined
      ? rasterEntries.some(({ blend }) => blend === 'linear') || !rasterEntries.some(({ blend }) => blend === 'normal')
      : parsed.blending === 'linear';
  return {
    nodes: ordered,
    layers: ordered.filter((node): node is Layer => node.kind !== 'group'),
    activeId: parsed.activeId,
    camera: parsed.camera,
    features: { ...legacy, ...parsed.features },
    psdIdentity: parsed.psdIdentity,
    linearBlending
  };
}

/**
 * Camera-only record stored beside the checkpoint under the `view` key. Navigation rewrites only this small record;
 * a full checkpoint rewrites it too, so it always holds the newest camera. Older databases without it keep using the
 * checkpoint camera, and the checkpoint format (version 3) is unchanged.
 */
export function snapshotView(camera: Camera) {
  return { camera: { ...camera } };
}

/** Validates a stored view record. Missing or malformed records return undefined so the checkpoint camera is used. */
export function restoreView(value: unknown): Camera | undefined {
  const parsed = viewSchema.safeParse(value);
  return parsed.success ? parsed.data.camera : undefined;
}

/**
 * What a closing engine hands to the next engine of the same drawing, such as Paint in a new tab: the undo history,
 * referring to stored tile versions, and the renderer's tool state. Stored beside the checkpoint under the `handoff`
 * key, written in the same transaction; every other checkpoint removes it, so a stored handoff always continues the
 * stored drawing.
 */
export type EngineHandoff = { version: 1; history: DocumentHistory; tools?: RendererToolState };

/**
 * Validates a stored handoff record. Missing, older or malformed records return undefined, and the drawing opens with
 * an empty history. The record is this app's own data, so only its shape is checked.
 */
export function restoreHandoff(value: unknown): EngineHandoff | undefined {
  return handoffSchema.safeParse(value).success ? (value as EngineHandoff) : undefined;
}

/** Encodes a portable JSON document. Large tile arrays are stored as base64, not JSON numbers. */
export function encodeDocument(document: SavedDocument): string {
  return JSON.stringify({
    ...document,
    layers: document.layers.map((node) =>
      node.kind === 'group'
        ? node
        : {
            ...node,
            tiles: node.tiles.map((tile) => {
              if (!(tile.pixels instanceof Uint8Array))
                throw new Error('Materialize tile references before exporting.');
              return { key: tile.key, pixels: toBase64(tile.pixels) };
            })
          }
    )
  });
}

/** Decodes an external file and rejects malformed pixels and unsupported versions. */
export function decodeDocument(text: string): ReturnType<typeof restoreDocument> {
  if (text.length > MAX_DOCUMENT_BYTES * 1.5) throw new Error('The selected file is too large.');
  const value: unknown = JSON.parse(text, (key, value: unknown) => {
    if (key !== 'pixels' || typeof value !== 'string') return value;
    if (!value.length || value.length > Math.ceil(TILE_BYTES / 3) * 4) throw new Error('Invalid tile encoding.');
    const raw = atob(value);
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  });
  if (typeof value === 'object' && value && 'version' in value && value.version === 3)
    throw new Error('Internal checkpoint format is not a portable drawing.');
  return restoreDocument(value, true);
}

function toBase64(pixels: Uint8Array): string {
  let text = '';
  for (let i = 0; i < pixels.length; i += 8192) text += String.fromCharCode(...pixels.subarray(i, i + 8192));
  return btoa(text);
}
const finite = z.number().finite();
const unit = finite.min(0).max(1);
const cameraSchema = z.object({ x: finite, y: finite, zoom: finite.min(0.05).max(32), angle: finite, mirrored: z.boolean() });
const viewSchema = z.object({ camera: cameraSchema });
const handoffSchema = z.object({
  version: z.literal(1),
  history: z.object({
    undo: z.array(z.object({ id: z.number(), tiles: z.array(z.unknown()) })),
    redo: z.array(z.object({ id: z.number(), tiles: z.array(z.unknown()) })),
    nextId: z.number(),
    baseId: z.number(),
    bytes: z.number(),
    source: z.object({ id: z.number(), label: z.string(), layers: z.array(z.object({ tiles: z.instanceof(Map) })) })
  })
});
const psdIdentitySchema = z
  .object({
    creation: z.object({
      originalDocumentId: z.string().regex(/^xmp\.did:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
      instanceId: z.string().regex(/^xmp\.iid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
      when: z.iso.datetime({ offset: true }),
      creatorTool: z.literal('Paint')
    }),
    nextLayerId: z.number().int().min(2).max(2147483647),
    layers: z.record(z.string(), z.object({ id: z.number().int().positive().max(2147483647), time: finite.positive() }))
  })
  .refine((identity) => {
    const ids = Object.values(identity.layers).map((layer) => layer.id);
    return (
      new Set(ids).size === ids.length &&
      ids.every((id) => id < identity.nextLayerId) &&
      identity.creation.originalDocumentId.slice(8) === identity.creation.instanceId.slice(8)
    );
  }, 'Invalid PSD creation or layer identities.');
const tileEntries = z
  .array(
    z.object({
      key: z.string().regex(/^-?\d{1,9},-?\d{1,9}$/),
      pixels: z.union([
        z.instanceof(Uint8Array),
        z.object({ storageId: z.string().uuid(), byteLength: z.number().int().min(8).max(TILE_BYTES) })
      ])
    })
  )
  .max(MAX_DOCUMENT_TILES);
const nodeId = z.string().min(1).max(100);
const rasterFields = {
  id: nodeId,
  name: z.string().max(200),
  visible: z.boolean(),
  opacity: unit,
  /** `linear`, Smooth color, was a blend mode before linear blending became the document's `blending`. */
  blend: z.enum(['normal', 'multiply', 'screen', 'overlay', 'linear']),
  alphaLock: z.boolean().optional(),
  clipping: z.boolean().optional(),
  tiles: tileEntries
};
/** A raster layer of a version 1–3 document, before folders; any other field is dropped, and it opens at the root. */
const legacyLayerSchema = z.object(rasterFields);
type LegacyLayer = z.infer<typeof legacyLayerSchema>;
const savedRasterSchema = z.object({ kind: z.literal('raster'), parentId: nodeId.optional(), ...rasterFields });
type SavedRaster = z.infer<typeof savedRasterSchema>;
const savedGroupSchema = z
  .object({
    kind: z.literal('group'),
    id: nodeId,
    parentId: nodeId.optional(),
    name: z.string().max(200),
    visible: z.boolean(),
    opacity: unit,
    blend: z.enum(['pass-through', 'normal', 'multiply', 'screen', 'overlay']),
    clipping: z.boolean().optional()
  })
  // Folders show their layers as they are; one saved with effects of its own would show wrongly, so it is refused.
  .refine((group) => group.opacity === 1 && group.blend === 'pass-through' && !group.clipping, {
    message: 'This drawing has folders with an opacity, blend mode or clipping this version of Paint cannot show.'
  });
type SavedGroup = z.infer<typeof savedGroupSchema> & LayerGroup;
const savedFields = {
  psdIdentity: psdIdentitySchema.optional(),
  tileSize: z.literal(TILE_SIZE),
  activeId: z.string(),
  /** Paint symmetry of documents saved before document features; see `restoreDocument`. */
  symmetry: z.unknown().optional(),
  features: z.record(z.string(), z.unknown()).default({}),
  /** Whether layers blend in linear light or encoded sRGB; see `restoreDocument` for documents without it. */
  blending: z.enum(['linear', 'classic']).optional(),
  camera: cameraSchema
};
const savedSchema = z.union([
  z.object({
    ...savedFields,
    version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    layers: z.array(legacyLayerSchema).min(1).max(MAX_LAYERS)
  }),
  z.object({
    ...savedFields,
    version: z.literal(4),
    layers: z
      .array(z.discriminatedUnion('kind', [savedRasterSchema, savedGroupSchema]))
      .min(1)
      .max(MAX_LAYERS + MAX_FOLDERS)
  })
]);
