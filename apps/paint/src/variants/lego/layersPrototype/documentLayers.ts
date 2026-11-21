import type { BlendMode, LayerAction } from '@app-game/paint-core/document';
import { editLayerTree, subtreeIds, type LayerPlace } from '@app-game/paint-core/layerTree';
import { createMemo, createSignal } from 'solid-js';
import type { LegoServices } from '../LegoServices';
import {
  defaultBlendIf,
  emptyLocks,
  findNode,
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
 * change that would leave the drawing as it is sends nothing, so it adds no empty undo step.
 *
 * The engine keeps a tree of raster layers and folders. Raster layers have name, visibility, opacity, four blend
 * modes, alpha lock and clipping; folders only organise: they show their layers as they are (Pass Through at full
 * strength), so a folder has a name and visibility only (`groups.passThroughOnly`). So this model offers groups
 * (enter a folder in the narrow strip, expand it in the wide tree, add, group, ungroup, drag into and out of
 * folders), and multi-selection for grouping and deleting several layers, each one engine action and one undo step.
 * It offers no masks, adjustment layers, fill, Blend If, colour tags, Reference, other locks, Paper or clearing, and
 * no Solo: the engine has no action that shows one layer alone, so hiding the others would take one undo step each.
 *
 * `send` is the part's guarded command (`frame.command(layers.action)`), so previews never edit. Thumbnails are read
 * only while `thumbnails()` holds (never in a catalog preview); the view that shows them asks for them through
 * `wantThumbnails`; folders have none. Which folders the narrow strip has entered, which ones the wide tree has
 * collapsed (new folders show open) and which layers are selected belong to the view: a part makes one per mounted
 * view.
 */
export function createDocumentLayers(options: {
  layers: Pick<LegoServices['layers'], 'state' | 'ready' | 'wantThumbnails' | 'thumbnail'>;
  send: (action: LayerAction) => void;
  thumbnails: () => boolean;
}): LayersModel {
  const { layers: document, send } = options;
  /** The engine's layer tree in canonical order: every folder right after its children, siblings bottom first. */
  const engineNodes = () => document.state().nodes;
  const byId = createMemo(() => new Map(engineNodes().map((node) => [node.id, node])));
  const find = (id: string) => byId().get(id);
  const tree = createMemo(() => {
    const shown = options.thumbnails();
    return layerTree(engineNodes(), (id) => (shown ? document.thumbnail(id) : undefined));
  });
  const activeId = createMemo(() => document.state().activeId);

  const [entered, setEntered] = createSignal<readonly string[]>([]);
  /** The entered folders that still exist, each inside the one before; the first that is not ends the path. */
  const stack = createMemo(() => {
    const path: string[] = [];
    for (const id of entered()) {
      const node = find(id);
      if (node?.kind !== 'group' || node.parentId !== path.at(-1)) {
        break;
      }

      path.push(id);
    }

    return path;
  });
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set());
  const expandedIds = createMemo(() =>
    engineNodes()
      .filter((node) => node.kind === 'group' && !collapsed().has(node.id))
      .map((node) => node.id)
  );
  const [picked, setPicked] = createSignal<readonly string[]>([]);
  const selectedIds = createMemo(() => picked().filter((id) => byId().has(id)));

  /** Whether `id` and every folder it is in are visible, as merging needs. */
  const shows = (id: string): boolean => {
    const node = find(id);
    return !!node && node.visible && (node.parentId === undefined || shows(node.parentId));
  };
  /** Whether deleting `ids` and everything inside them leaves a raster layer, as the drawing must keep. */
  const leavesLayer = (ids: readonly string[]) => {
    const removed = new Set(ids.flatMap((id) => subtreeIds(engineNodes(), id)));
    return removed.size > 0 && engineNodes().some((node) => node.kind === 'raster' && !removed.has(node.id));
  };
  /** Leaves the entered folders from `id` on, which a command is about to take away or move. */
  const leaveEntered = (id: string) => {
    const at = stack().indexOf(id);
    if (at >= 0) {
      setEntered(stack().slice(0, at));
    }
  };
  /**
   * Where a new layer or folder goes: right above the active node in its folder, or at the top of the folder the
   * narrow strip has entered while that folder is the active node.
   */
  const newPlace = (): LayerPlace => {
    const active = find(activeId());
    const current = stack().at(-1);
    if (!active || active.id === current) {
      return { parentId: current ?? null, side: 'above' };
    }

    return { parentId: active.parentId ?? null, anchorId: active.id, side: 'above' };
  };
  /** Sends `relocate` to `place` when the engine would accept it and it moves the node. */
  const relocate = (id: string, place: LayerPlace) => {
    if (moves(engineNodes(), id, place)) {
      send({ type: 'relocate', id, ...place });
    }
  };
  const select = (id: string) => {
    if (id !== activeId() && find(id)) {
      send({ type: 'select', id });
    }
  };

  return {
    capabilities: {
      blendModes: psdBlendModes.filter((mode) => isDocumentBlend(mode.id)),
      locks: ['alpha'],
      clipping: true,
      fill: false,
      blendIf: false,
      colorTags: false,
      reference: false,
      dropZones: ['before', 'after', 'into']
    },
    ready: document.ready,
    layers: tree,
    activeId,
    activeLayer: () => findNode(tree(), activeId()),
    totalCount: () => engineNodes().length,
    select,
    update(id, patch) {
      const node = find(id);
      if (!node) {
        return;
      }

      const changes = node.kind === 'group' ? folderPatch(node, patch) : documentPatch(node, patch);
      if (Object.keys(changes).length > 0) {
        send({ type: 'update', id, patch: changes });
      }
    },
    addLayer: () => send({ type: 'add', place: newPlace() }),
    duplicate: (id) => send({ type: 'duplicate', id }),
    canDelete: (id) => leavesLayer([id]),
    delete(id) {
      if (leavesLayer([id])) {
        leaveEntered(id);
        send({ type: 'delete', id });
      }
    },
    canMergeDown: (id) => canMergeDown(engineNodes(), id, shows),
    mergeDown(id) {
      if (canMergeDown(engineNodes(), id, shows)) {
        send({ type: 'merge-down', id });
      }
    },
    reorder(dragId, targetId, zone) {
      const place = dropPlace(find(targetId), zone);
      if (place && dragId !== targetId) {
        relocate(dragId, place);
      }
    },
    wantThumbnails: (cssSize) => document.wantThumbnails(cssSize),
    selection: {
      ids: selectedIds,
      toggle(id) {
        setPicked(selectedIds().includes(id) ? selectedIds().filter((other) => other !== id) : [...selectedIds(), id]);
      },
      clear: () => setPicked([]),
      delete(ids) {
        if (leavesLayer(ids)) {
          ids.forEach(leaveEntered);
          send({ type: 'delete', ids: [...ids] });
        }

        setPicked([]);
      }
    },
    groups: {
      passThroughOnly: true,
      stack,
      expandedIds,
      add: () => send({ type: 'add-group', place: newPlace() }),
      enter(id) {
        const node = find(id);
        if (node?.kind !== 'group') {
          return;
        }

        const path: string[] = [];
        for (let folder: string | undefined = id; folder !== undefined; folder = find(folder)?.parentId) {
          path.unshift(folder);
        }

        setEntered(path);
        // As the prototype does: the folder's top node becomes active, or the folder when it is empty.
        select(findNode(tree(), id)?.children?.[0]?.id ?? id);
      },
      exit() {
        const current = stack().at(-1);
        if (current !== undefined) {
          setEntered(stack().slice(0, -1));
          select(current);
        }
      },
      toggleExpand(id) {
        const next = new Set(collapsed());
        if (!next.delete(id)) {
          next.add(id);
        }

        setCollapsed(next);
      },
      group(ids) {
        if (ids.some((id) => byId().has(id))) {
          send({ type: 'group', ids: [...ids] });
        }

        setPicked([]);
      },
      ungroup(id) {
        if (find(id)?.kind === 'group') {
          leaveEntered(id);
          send({ type: 'ungroup', id });
        }
      },
      moveOut(id) {
        const parent = find(find(id)?.parentId ?? '');
        if (parent) {
          if (stack().at(-1) === parent.id) {
            setEntered(stack().slice(0, -1));
          }

          relocate(id, { parentId: parent.parentId ?? null, anchorId: parent.id, side: 'above' });
        }
      }
    }
  };
}

type DocumentNode = ReturnType<LegoServices['layers']['state']>['nodes'][number];
type DocumentLayer = Extract<DocumentNode, { kind: 'raster' }>;
type DocumentFolder = Extract<DocumentNode, { kind: 'group' }>;

/**
 * The engine's nodes, in canonical order, as the layers UI's tree: top first in every folder, a folder's children
 * under it. `thumb` gives a raster layer's thumbnail; folders have none.
 */
export function layerTree(
  nodes: readonly DocumentNode[],
  thumb: (id: string) => string | undefined = () => undefined
): LayerNode[] {
  const siblings = new Map<string, DocumentNode[]>();
  for (const node of nodes) {
    const key = node.parentId ?? '';
    siblings.set(key, [...(siblings.get(key) ?? []), node]);
  }

  const build = (key: string): LayerNode[] =>
    (siblings.get(key) ?? [])
      .toReversed()
      .map((node) => (node.kind === 'group' ? folderNode(node, build(node.id)) : layerNode(node, thumb(node.id))));
  return build('');
}

/**
 * Where a drop in `zone` of `target` puts the dragged node: right above (`before`) or below (`after`) it in its
 * folder, or at the top of it (`into`) when it is a folder. Clip drops have no place: the engine cannot move and clip
 * in one step.
 */
function dropPlace(target: DocumentNode | undefined, zone: ReorderZone): LayerPlace | undefined {
  if (!target || zone === 'clip' || (zone === 'into' && target.kind !== 'group')) {
    return undefined;
  }

  if (zone === 'into') {
    return { parentId: target.id, side: 'above' };
  }

  return { parentId: target.parentId ?? null, anchorId: target.id, side: zone === 'before' ? 'above' : 'below' };
}

/**
 * Whether the engine would move node `id` to `place`: it accepts the place (no folder into itself, an anchor in the
 * folder) and the tree changes.
 */
function moves(nodes: readonly DocumentNode[], id: string, place: LayerPlace) {
  try {
    const draft = editLayerTree(nodes);
    draft.move(id, place);
    const moved = draft.result();
    return moved.some((node, index) => node.id !== nodes[index]!.id || node.parentId !== nodes[index]!.parentId);
  } catch {
    return false;
  }
}

/** An engine raster layer as the layers UI shows it; what the engine does not keep holds its default. */
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

/** An engine folder as the layers UI shows it: Pass Through at full strength, without a thumbnail. */
function folderNode(folder: DocumentFolder, children: readonly LayerNode[]): LayerNode {
  return {
    id: folder.id,
    name: folder.name,
    type: 'group',
    visible: folder.visible,
    blend: 'pass-through',
    opacity: 100,
    fill: 100,
    clipping: false,
    reference: false,
    locks: emptyLocks(),
    colorTag: 'none',
    thumb: undefined,
    blendIf: defaultBlendIf(),
    children
  };
}

/** The engine fields of `patch` that differ from `layer`; fields the engine does not keep are left out. */
function documentPatch(layer: DocumentLayer, patch: LayerPatch) {
  const changes: Extract<LayerAction, { type: 'update' }>['patch'] = { ...folderPatch(layer, patch) };
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

/** The name and visibility of `patch` that differ from `node`: all a folder keeps. */
function folderPatch(node: { name: string; visible: boolean }, patch: LayerPatch) {
  const changes: Extract<LayerAction, { type: 'update' }>['patch'] = {};
  const name = patch.name?.trim();
  if (name && name !== node.name) {
    changes.name = name;
  }

  if (patch.visible !== undefined && patch.visible !== node.visible) {
    changes.visible = patch.visible;
  }

  return changes;
}

/**
 * As the engine merges: a raster layer onto the raster layer right below it in the same folder, both shown with the
 * folders they are in.
 */
function canMergeDown(nodes: readonly DocumentNode[], id: string, shows: (id: string) => boolean) {
  const index = nodes.findIndex((node) => node.id === id);
  const node = nodes[index];
  const below = nodes[index - 1];
  // A raster layer ends no subtree, so the sibling right below it is the node right before it, if in its folder.
  return (
    node?.kind === 'raster' &&
    below?.kind === 'raster' &&
    below.parentId === node.parentId &&
    shows(node.id) &&
    shows(below.id)
  );
}

const documentBlendModes = { normal: true, multiply: true, screen: true, overlay: true } satisfies Record<
  BlendMode,
  true
>;

function isDocumentBlend(mode: PsdBlendMode): mode is BlendMode {
  return Object.hasOwn(documentBlendModes, mode);
}
