import type { BlendMode, LayerAction } from '@app-game/paint-core/document';
import { createMemo } from 'solid-js';
import type { LegoServices } from '../LegoServices';
import {
  defaultBlendIf,
  emptyLocks,
  psdBlendModes,
  type LayerNode,
  type LayerPatch,
  type LayersModel,
  type PsdBlendMode,
  type ReorderZone
} from './layersModel';

/**
 * The drawing's own layers as a `LayersModel`, over `layers` (`LegoServices['layers']`). Every edit is one
 * `LayerAction` through `send`, so it lands in the document's undo history and the board's Undo takes it back; a
 * change that would leave a layer as it is sends nothing, so it adds no empty undo step.
 *
 * The engine keeps a flat list of raster layers, bottom first, with name, visibility, opacity, four blend modes,
 * alpha lock and clipping. So this model offers no groups, masks, adjustment layers, fill, Blend If, colour tags,
 * Reference, other locks, Paper or clearing. It offers no Solo and no multi-selection either: the engine has no
 * action that changes several layers at once, so hiding the others for Solo, or deleting a selection, would take one
 * undo step per layer, and the board's Undo would unpick it a layer at a time.
 *
 * `send` is the part's guarded command (`frame.command(layers.action)`), so previews never edit. Thumbnails are read
 * only while `thumbnails()` holds (never in a catalog preview); the view that shows them asks for them through
 * `wantThumbnails`. Holds no state of its own: a part may make one per mounted view.
 */
export function createDocumentLayers(options: {
  layers: Pick<LegoServices['layers'], 'state' | 'ready' | 'wantThumbnails' | 'thumbnail'>;
  send: (action: LayerAction) => void;
  thumbnails: () => boolean;
}): LayersModel {
  const { layers: document, send } = options;
  /** Engine layers, bottom first, as `state().layers` keeps them. */
  const engineLayers = () => document.state().layers;
  const nodes = createMemo(() => {
    const shown = options.thumbnails();
    return engineLayers()
      .map((layer) => layerNode(layer, shown ? document.thumbnail(layer.id) : undefined))
      .reverse();
  });
  const activeId = createMemo(() => document.state().activeId);
  const find = (id: string) => engineLayers().find((layer) => layer.id === id);

  return {
    capabilities: {
      blendModes: psdBlendModes.filter((mode) => isDocumentBlend(mode.id)),
      locks: ['alpha'],
      clipping: true,
      fill: false,
      blendIf: false,
      colorTags: false,
      reference: false,
      dropZones: ['before', 'after']
    },
    ready: document.ready,
    layers: nodes,
    activeId,
    activeLayer: () => nodes().find((node) => node.id === activeId()),
    totalCount: () => engineLayers().length,
    select(id) {
      if (id !== activeId() && find(id)) {
        send({ type: 'select', id });
      }
    },
    update(id, patch) {
      const layer = find(id);
      if (!layer) {
        return;
      }

      const changes = documentPatch(layer, patch);
      if (Object.keys(changes).length > 0) {
        send({ type: 'update', id, patch: changes });
      }
    },
    addLayer: () => send({ type: 'add' }),
    duplicate: (id) => send({ type: 'duplicate', id }),
    canDelete: (id) => engineLayers().length > 1 && !!find(id),
    delete(id) {
      if (engineLayers().length > 1 && find(id)) {
        send({ type: 'delete', id });
      }
    },
    canMergeDown: (id) => canMergeDown(engineLayers(), id),
    mergeDown(id) {
      if (canMergeDown(engineLayers(), id)) {
        send({ type: 'merge-down', id });
      }
    },
    reorder(dragId, targetId, zone) {
      const index = reorderIndex(engineLayers(), dragId, targetId, zone);
      if (index !== undefined) {
        send({ type: 'reorder', id: dragId, index });
      }
    },
    wantThumbnails: (cssSize) => document.wantThumbnails(cssSize)
  };
}

/**
 * The bottom-first index the engine's `reorder` takes to put `dragId` right above (`before`) or right below (`after`)
 * `targetId` in the top-first strip; undefined when the drop leaves the order as it is or names no layer.
 */
export function reorderIndex(
  layers: readonly { id: string }[],
  dragId: string,
  targetId: string,
  zone: ReorderZone
): number | undefined {
  if (dragId === targetId || (zone !== 'before' && zone !== 'after')) {
    return undefined;
  }

  const current = layers.findIndex((layer) => layer.id === dragId);
  const topFirst = layers.map((layer) => layer.id).reverse();
  const others = topFirst.filter((id) => id !== dragId);
  const target = others.indexOf(targetId);
  if (current < 0 || target < 0) {
    return undefined;
  }

  const position = zone === 'before' ? target : target + 1;
  const index = layers.length - 1 - position;
  return index === current ? undefined : index;
}

type DocumentLayer = ReturnType<LegoServices['layers']['state']>['layers'][number];

/** An engine layer as the layers UI shows it; what the engine does not keep holds its default. */
function layerNode(layer: DocumentLayer, thumb: string | undefined): LayerNode {
  return {
    id: layer.id,
    name: layer.name,
    type: 'raster',
    visible: layer.visible,
    blend: layer.blend,
    opacity: Math.round(layer.opacity * 100),
    fill: 100,
    clipping: !!layer.clipping,
    reference: false,
    locks: { ...emptyLocks(), alpha: !!layer.alphaLock },
    colorTag: 'none',
    thumb,
    blendIf: defaultBlendIf()
  };
}

/** The engine fields of `patch` that differ from `layer`; fields the engine does not keep are left out. */
function documentPatch(layer: DocumentLayer, patch: LayerPatch) {
  const changes: Extract<LayerAction, { type: 'update' }>['patch'] = {};
  const name = patch.name?.trim();
  if (name && name !== layer.name) {
    changes.name = name;
  }

  if (patch.visible !== undefined && patch.visible !== layer.visible) {
    changes.visible = patch.visible;
  }

  if (patch.opacity !== undefined) {
    const percent = Math.max(0, Math.min(100, Math.round(patch.opacity)));
    if (percent !== Math.round(layer.opacity * 100)) {
      changes.opacity = percent / 100;
    }
  }

  if (patch.blend !== undefined && isDocumentBlend(patch.blend) && patch.blend !== layer.blend) {
    changes.blend = patch.blend;
  }

  if (patch.clipping !== undefined && patch.clipping !== !!layer.clipping) {
    changes.clipping = patch.clipping;
  }

  if (patch.locks?.alpha !== undefined && patch.locks.alpha !== !!layer.alphaLock) {
    changes.alphaLock = patch.locks.alpha;
  }

  return changes;
}

/** As the Merge down part has it: a layer below, and both layers shown. */
function canMergeDown(layers: readonly DocumentLayer[], id: string) {
  const index = layers.findIndex((layer) => layer.id === id);
  const below = layers[index - 1];
  return index > 0 && !!below?.visible && layers[index]!.visible;
}

const documentBlendModes = { normal: true, multiply: true, screen: true, overlay: true } satisfies Record<
  BlendMode,
  true
>;

function isDocumentBlend(mode: PsdBlendMode): mode is BlendMode {
  return Object.hasOwn(documentBlendModes, mode);
}
