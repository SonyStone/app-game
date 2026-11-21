import { createMemo } from 'solid-js';
import { createImmediateSignal } from '../../../shared/createImmediateSignal';
import {
  countLayers,
  defaultBlendIf,
  emptyLocks,
  findNode,
  findNodeWithParent,
  psdBlendModes,
  type LayerNode,
  type LayerPatch,
  type LayersModel,
  type PaperState,
  type PsdBlendMode,
  type ReorderZone
} from './layersModel';

type PrototypeSnapshot = {
  layers: LayerNode[];
  activeId: string;
  target: 'layer' | 'mask';
  maskOverlay: boolean;
  maskBrush: 'reveal' | 'hide';
  groupStack: string[];
  expandedIds: string[];
  selectedIds: string[];
  soloId: string | undefined;
  paper: PaperState;
  favoriteBlends: PsdBlendMode[];
};

/**
 * Reactive PSD-like mock layer model for the LEGO layers UI prototype: hierarchical groups, masks, 27 blend modes
 * with favorites, 4 PSD locks, Blend If ranges, Solo, multi-selection, Paper layer, and 30-step local undo/redo.
 */
export function createMockLayers() {
  const [state, setState, latestState] = createImmediateSignal<PrototypeSnapshot>(initialSnapshot());
  const [past, setPast, latestPast] = createImmediateSignal<PrototypeSnapshot[]>([]);
  const [future, setFuture, latestFuture] = createImmediateSignal<PrototypeSnapshot[]>([]);
  let nextLayerNumber = 1;
  let nextGroupNumber = 1;

  /** Commits a state update, optionally pushing the previous snapshot onto the local undo stack. */
  const commit = (update: (current: PrototypeSnapshot) => PrototypeSnapshot, recordUndo = true) => {
    const current = latestState();
    const next = normalizeSnapshot(update(current));
    if (next === current) {
      return;
    }

    if (recordUndo) {
      setPast([...latestPast().slice(-(maxUndoSteps - 1)), current]);
      setFuture([]);
    }

    setState(next);
  };

  const layers = createMemo(() => state().layers);
  const activeId = createMemo(() => state().activeId);
  const activeLayer = createMemo(() => findNode(state().layers, state().activeId));
  const target = createMemo<'layer' | 'mask'>(() => (activeLayer()?.mask ? state().target : 'layer'));
  const maskOverlay = createMemo(() => state().maskOverlay);
  const maskBrush = createMemo(() => state().maskBrush);
  const groupStack = createMemo(() => state().groupStack);
  const expandedIds = createMemo(() => state().expandedIds);
  const selectedIds = createMemo(() => state().selectedIds);
  const soloId = createMemo(() => state().soloId);
  const paper = createMemo(() => state().paper);
  const favoriteBlends = createMemo(() => state().favoriteBlends);
  const totalCount = createMemo(() => countLayers(state().layers));
  const canUndo = createMemo(() => past().length > 0);
  const canRedo = createMemo(() => future().length > 0);

  return {
    layers,
    activeId,
    activeLayer,
    target,
    maskOverlay,
    maskBrush,
    groupStack,
    expandedIds,
    selectedIds,
    soloId,
    paper,
    favoriteBlends,
    totalCount,
    canUndo,
    canRedo,

    /** Selects `id` (and optionally switches the paint target between `'layer'` and `'mask'`). */
    select(id: string, nextTarget?: 'layer' | 'mask') {
      commit((current) => {
        const node = findNode(current.layers, id);
        if (!node) {
          return current;
        }

        const resolvedTarget = nextTarget === 'mask' && node.mask ? 'mask' : 'layer';
        const enteringMask = resolvedTarget === 'mask' && current.target !== 'mask';
        return {
          ...current,
          activeId: id,
          target: resolvedTarget,
          maskOverlay: enteringMask ? true : current.maskOverlay
        };
      }, false);
    },

    /** Switches between painting on the active layer's pixels or its mask. */
    setTarget(nextTarget: 'layer' | 'mask') {
      commit((current) => {
        const node = findNode(current.layers, current.activeId);
        if (!node) {
          return current;
        }

        const resolved = nextTarget === 'mask' && node.mask ? 'mask' : 'layer';
        const enteringMask = resolved === 'mask' && current.target !== 'mask';
        return {
          ...current,
          target: resolved,
          maskOverlay: enteringMask ? true : current.maskOverlay
        };
      }, false);
    },

    /** Adds a new raster layer above the active layer (or at the top of the current group). */
    addLayer() {
      const id = `mock-layer-${nextLayerNumber++}`;
      const created: LayerNode = {
        id,
        name: `Layer ${nextLayerNumber - 1}`,
        type: 'raster',
        visible: true,
        blend: 'normal',
        opacity: 100,
        fill: 100,
        clipping: false,
        reference: false,
        locks: emptyLocks(),
        colorTag: 'none',
        thumb: thumbEmpty(),
        blendIf: defaultBlendIf()
      };
      commit((current) => ({
        ...current,
        layers: insertAboveActive(current.layers, current.activeId, current.groupStack, created),
        activeId: id,
        target: 'layer',
        selectedIds: []
      }));
      return id;
    },

    /** Adds a new empty group above the active layer and expands it in wide view. */
    addGroup() {
      const id = `mock-group-${nextGroupNumber++}`;
      const created: LayerNode = {
        id,
        name: `Group ${nextGroupNumber - 1}`,
        type: 'group',
        visible: true,
        blend: 'pass-through',
        opacity: 100,
        fill: 100,
        clipping: false,
        reference: false,
        locks: emptyLocks(),
        colorTag: 'none',
        thumb: thumbGroup(),
        blendIf: defaultBlendIf(),
        children: []
      };
      commit((current) => ({
        ...current,
        layers: insertAboveActive(current.layers, current.activeId, current.groupStack, created),
        activeId: id,
        target: 'layer',
        expandedIds: unique([...current.expandedIds, id]),
        selectedIds: []
      }));
      return id;
    },

    /** Duplicates layer `id` (defaults to the active layer) right above itself. */
    duplicate(id = state().activeId) {
      commit((current) => {
        const node = findNode(current.layers, id);
        if (!node) {
          return current;
        }

        const copy = cloneNode(node, () => `mock-copy-${nextLayerNumber++}`);
        copy.name = `${node.name} copy`;
        return {
          ...current,
          layers: insertBeside(current.layers, id, copy, 'before'),
          activeId: copy.id,
          target: 'layer'
        };
      });
    },

    /** Deletes `ids` (or the active layer), keeping at least one layer in the document. */
    delete(ids?: readonly string[]) {
      commit((current) => {
        const toRemove = new Set(ids && ids.length > 0 ? ids : [current.activeId]);
        const nextLayers = removeNodes(current.layers, toRemove);
        if (nextLayers.length === 0) {
          return current;
        }

        const nextActive = findNode(nextLayers, current.activeId) ? current.activeId : nextLayers[0]!.id;
        return {
          ...current,
          layers: nextLayers,
          activeId: nextActive,
          selectedIds: current.selectedIds.filter((selected) => !toRemove.has(selected)),
          soloId: current.soloId && toRemove.has(current.soloId) ? undefined : current.soloId
        };
      });
    },

    /** Merges `id` into the sibling directly below it (if any). */
    mergeDown(id = state().activeId) {
      commit((current) => {
        const located = findNodeWithParent(current.layers, id);
        if (!located || located.index >= located.siblings.length - 1) {
          return current;
        }

        const below = located.siblings[located.index + 1]!;
        const nextLayers = removeNodes(current.layers, new Set([id]));
        return {
          ...current,
          layers: mapNode(nextLayers, below.id, (node) => ({
            ...node,
            name: node.name,
            thumb: node.thumb
          })),
          activeId: below.id,
          target: 'layer'
        };
      });
    },

    /** Clears the pixel thumbnail of raster layer `id`. */
    clear(id = state().activeId) {
      commit((current) => ({
        ...current,
        layers: mapNode(current.layers, id, (node) =>
          node.type === 'raster' ? { ...node, thumb: thumbEmpty() } : node
        )
      }));
    },

    /** Updates properties (name, visibility, blend, opacity, fill, locks, clipping, reference, tag, blendIf). */
    update(id: string, patch: LayerPatch) {
      commit((current) => ({
        ...current,
        layers: mapNode(current.layers, id, (node) => {
          const nextLocks = patch.locks ? { ...node.locks, ...patch.locks } : node.locks;
          return {
            ...node,
            ...patch,
            opacity: patch.opacity !== undefined ? clamp(Math.round(patch.opacity), 0, 100) : node.opacity,
            fill: patch.fill !== undefined ? clamp(Math.round(patch.fill), 0, 100) : node.fill,
            locks: nextLocks
          };
        })
      }));
    },

    /** Adds a reveal-all mask to `id` and immediately targets it with Rubylith enabled. */
    addMask(id = state().activeId) {
      commit((current) => {
        const node = findNode(current.layers, id);
        if (!node || node.mask) {
          return current;
        }

        return {
          ...current,
          layers: mapNode(current.layers, id, (item) => ({
            ...item,
            mask: { thumb: thumbMaskSoft(false), enabled: true, linked: true, inverted: false }
          })),
          activeId: id,
          target: 'mask',
          maskOverlay: true
        };
      });
    },

    toggleMaskEnabled(id = state().activeId) {
      commit((current) => ({
        ...current,
        layers: mapNode(current.layers, id, (node) =>
          node.mask ? { ...node, mask: { ...node.mask, enabled: !node.mask.enabled } } : node
        )
      }));
    },

    invertMask(id = state().activeId) {
      commit((current) => ({
        ...current,
        layers: mapNode(current.layers, id, (node) => {
          if (!node.mask) {
            return node;
          }

          const inverted = !node.mask.inverted;
          return {
            ...node,
            mask: { ...node.mask, inverted, thumb: thumbMaskSoft(inverted) }
          };
        })
      }));
    },

    deleteMask(id = state().activeId) {
      commit((current) => ({
        ...current,
        layers: mapNode(current.layers, id, (node) => ({ ...node, mask: undefined })),
        target: current.activeId === id ? 'layer' : current.target
      }));
    },

    toggleRubylith() {
      commit((current) => ({ ...current, maskOverlay: !current.maskOverlay }), false);
    },

    setMaskBrush(brush: 'reveal' | 'hide') {
      commit((current) => ({ ...current, maskBrush: brush }), false);
    },

    toggleSolo(id: string) {
      commit(
        (current) => ({
          ...current,
          soloId: current.soloId === id ? undefined : id
        }),
        false
      );
    },

    /** Enters group `groupId` in strip view navigation. */
    enterGroup(groupId: string) {
      commit((current) => {
        const node = findNode(current.layers, groupId);
        if (!node || node.type !== 'group' || current.groupStack.at(-1) === groupId) {
          return current;
        }

        return {
          ...current,
          groupStack: [...current.groupStack, groupId],
          activeId: node.children?.[0]?.id ?? groupId
        };
      }, false);
    },

    /** Steps one level up in strip view navigation. */
    exitGroup() {
      commit((current) => {
        if (current.groupStack.length === 0) {
          return current;
        }

        const popped = current.groupStack.at(-1)!;
        return {
          ...current,
          groupStack: current.groupStack.slice(0, -1),
          activeId: popped
        };
      }, false);
    },

    /** Expands or collapses a group in the wide tree view. */
    toggleExpand(groupId: string) {
      commit((current) => {
        const open = current.expandedIds.includes(groupId);
        return {
          ...current,
          expandedIds: open ? current.expandedIds.filter((id) => id !== groupId) : [...current.expandedIds, groupId]
        };
      }, false);
    },

    toggleSelect(id: string) {
      commit((current) => {
        const exists = current.selectedIds.includes(id);
        return {
          ...current,
          selectedIds: exists ? current.selectedIds.filter((entry) => entry !== id) : [...current.selectedIds, id]
        };
      }, false);
    },

    clearSelection() {
      commit((current) => (current.selectedIds.length > 0 ? { ...current, selectedIds: [] } : current), false);
    },

    /** Groups `ids` (at least 1 valid node) into a new folder placed at the topmost member's position. */
    groupLayers(ids: readonly string[]) {
      const requested = unique(ids);
      if (requested.length === 0) {
        return undefined;
      }

      const groupId = `mock-group-${nextGroupNumber++}`;
      let createdGroup = false;
      commit((current) => {
        // Ignore nodes whose ancestor is already being grouped so we never nest a node inside itself.
        const selectedSet = new Set(requested);
        const topSelected = requested.filter((id) => !hasSelectedAncestor(current.layers, id, selectedSet));
        if (topSelected.length === 0) {
          return current;
        }

        const topSet = new Set(topSelected);
        // Preserve visual top-to-bottom order and place the new group at the first selected node's parent & index.
        const flatOrder = collectIds(current.layers).filter((id) => topSet.has(id));
        const anchor = flatOrder[0];
        if (!anchor) {
          return current;
        }

        const anchorLoc = findNodeWithParent(current.layers, anchor);
        if (!anchorLoc) {
          return current;
        }

        const extracted = flatOrder
          .map((id) => findNode(current.layers, id))
          .filter((node): node is LayerNode => node !== undefined);
        const stripped = removeNodes(current.layers, topSet);
        const group: LayerNode = {
          id: groupId,
          name: `Group ${nextGroupNumber - 1}`,
          type: 'group',
          visible: true,
          blend: 'pass-through',
          opacity: 100,
          fill: 100,
          clipping: false,
          reference: false,
          locks: emptyLocks(),
          colorTag: 'none',
          thumb: thumbGroup(),
          blendIf: defaultBlendIf(),
          children: extracted
        };

        // Insert at the anchor's parent at the adjusted index.
        const insertIndex = anchorLoc.siblings
          .slice(0, anchorLoc.index)
          .filter((sibling) => !topSet.has(sibling.id)).length;
        const nextLayers = insertIntoParent(stripped, anchorLoc.parentId, insertIndex, group);
        createdGroup = true;
        return {
          ...current,
          layers: nextLayers,
          activeId: groupId,
          target: 'layer',
          expandedIds: unique([...current.expandedIds, groupId]),
          selectedIds: []
        };
      });

      return createdGroup ? groupId : undefined;
    },

    /** Reorders `dragId` relative to `targetId` using Affinity drop zones: before, after, into (group), or clip. */
    reorder(dragId: string, targetId: string, zone: ReorderZone) {
      if (dragId === targetId) {
        return;
      }

      commit((current) => {
        const dragged = findNode(current.layers, dragId);
        const targetNode = findNode(current.layers, targetId);
        if (!dragged || !targetNode) {
          return current;
        }

        // Prevent dropping a group inside itself or any of its descendants.
        if (findNode([dragged], targetId)) {
          return current;
        }

        const stripped = removeNodes(current.layers, new Set([dragId]));
        if (zone === 'into' && targetNode.type === 'group') {
          const moved: LayerNode = { ...dragged, clipping: false };
          return {
            ...current,
            layers: insertIntoParent(stripped, targetId, 0, moved),
            expandedIds: unique([...current.expandedIds, targetId])
          };
        }

        if (zone === 'clip') {
          const moved: LayerNode = { ...dragged, clipping: true };
          return {
            ...current,
            layers: insertBeside(stripped, targetId, moved, 'before')
          };
        }

        const moved: LayerNode = { ...dragged, clipping: zone === 'before' ? dragged.clipping : false };
        return {
          ...current,
          layers: insertBeside(stripped, targetId, moved, zone === 'after' ? 'after' : 'before')
        };
      });
    },

    /** Moves `dragId` out of its current parent group to right above that group, stepping `groupStack` up if needed. */
    moveOutOfGroup(dragId: string) {
      commit((current) => {
        const located = findNodeWithParent(current.layers, dragId);
        if (!located || !located.parentId) {
          return current;
        }

        const dragged = located.node;
        const stripped = removeNodes(current.layers, new Set([dragId]));
        const nextLayers = insertBeside(stripped, located.parentId, { ...dragged, clipping: false }, 'before');
        const nextStack =
          current.groupStack.at(-1) === located.parentId ? current.groupStack.slice(0, -1) : current.groupStack;
        return {
          ...current,
          layers: nextLayers,
          groupStack: nextStack
        };
      });
    },

    setPaper(patch: Partial<PaperState>) {
      commit((current) => ({ ...current, paper: { ...current.paper, ...patch } }));
    },

    toggleFavoriteBlend(mode: PsdBlendMode) {
      commit((current) => {
        const has = current.favoriteBlends.includes(mode);
        return {
          ...current,
          favoriteBlends: has
            ? current.favoriteBlends.filter((entry) => entry !== mode)
            : [...current.favoriteBlends, mode]
        };
      }, false);
    },

    undo() {
      const stack = latestPast();
      if (stack.length === 0) {
        return;
      }

      const previous = stack.at(-1)!;
      setPast(stack.slice(0, -1));
      setFuture([...latestFuture(), latestState()]);
      setState(previous);
    },

    redo() {
      const stack = latestFuture();
      if (stack.length === 0) {
        return;
      }

      const next = stack.at(-1)!;
      setFuture(stack.slice(0, -1));
      setPast([...latestPast(), latestState()]);
      setState(next);
    },

    resetDemo() {
      setPast([]);
      setFuture([]);
      nextLayerNumber = 1;
      nextGroupNumber = 1;
      setState(initialSnapshot());
    }
  };
}

export type MockLayersService = ReturnType<typeof createMockLayers>;

/**
 * The prototype as a `LayersModel` offering everything the layers UI can show: every PSD blend mode with favourites,
 * fill, Blend If, colour tags, all four locks and Reference, groups, masks, Solo, multi-selection, Paper, clearing
 * and its own undo for the strip's toast. Forwards to `mock`, so it holds no state of its own and may be made per view.
 */
export function prototypeLayersModel(mock: MockLayersService): LayersModel {
  return {
    capabilities: {
      blendModes: psdBlendModes,
      locks: ['alpha', 'pixels', 'position', 'all'],
      clipping: true,
      fill: true,
      blendIf: true,
      colorTags: true,
      reference: true,
      dropZones: ['before', 'after', 'into', 'clip']
    },
    ready: () => true,
    layers: mock.layers,
    activeId: mock.activeId,
    activeLayer: mock.activeLayer,
    totalCount: mock.totalCount,
    select: (id) => mock.select(id, 'layer'),
    update: mock.update,
    addLayer: () => {
      mock.addLayer();
    },
    duplicate: (id) => mock.duplicate(id),
    canDelete: (id) => {
      const top = mock.layers();
      return !(top.length === 1 && top[0]!.id === id);
    },
    delete: (id) => mock.delete([id]),
    canMergeDown: (id) => {
      const located = findNodeWithParent(mock.layers(), id);
      return !!located && located.index < located.siblings.length - 1;
    },
    mergeDown: (id) => mock.mergeDown(id),
    reorder: mock.reorder,
    clear: (id) => mock.clear(id),
    favoriteBlends: { modes: mock.favoriteBlends, toggle: mock.toggleFavoriteBlend },
    selection: {
      ids: mock.selectedIds,
      toggle: mock.toggleSelect,
      clear: mock.clearSelection,
      delete: (ids) => mock.delete(ids)
    },
    solo: { id: mock.soloId, toggle: mock.toggleSolo },
    groups: {
      stack: mock.groupStack,
      expandedIds: mock.expandedIds,
      add: () => {
        mock.addGroup();
      },
      enter: mock.enterGroup,
      exit: mock.exitGroup,
      toggleExpand: mock.toggleExpand,
      group: (ids) => {
        mock.groupLayers(ids);
      },
      moveOut: mock.moveOutOfGroup
    },
    masks: {
      target: mock.target,
      overlay: mock.maskOverlay,
      brush: mock.maskBrush,
      setTarget: (id, target) => mock.select(id, target),
      exit: () => mock.setTarget('layer'),
      add: (id) => mock.addMask(id),
      toggleEnabled: (id) => mock.toggleMaskEnabled(id),
      invert: (id) => mock.invertMask(id),
      remove: (id) => mock.deleteMask(id),
      toggleOverlay: mock.toggleRubylith,
      setBrush: mock.setMaskBrush
    },
    paper: { state: mock.paper, set: mock.setPaper },
    localUndo: { canUndo: mock.canUndo, undo: mock.undo }
  };
}

const maxUndoSteps = 30;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function unique<T>(items: readonly T[]) {
  return [...new Set(items)];
}

function normalizeSnapshot(snapshot: PrototypeSnapshot): PrototypeSnapshot {
  const validStack: string[] = [];
  let current: readonly LayerNode[] = snapshot.layers;
  for (const id of snapshot.groupStack) {
    const found = current.find((node) => node.id === id && node.type === 'group');
    if (!found) {
      break;
    }

    validStack.push(id);
    current = found.children ?? [];
  }

  const active = findNode(snapshot.layers, snapshot.activeId);
  const activeId = active ? snapshot.activeId : (snapshot.layers[0]?.id ?? '');
  const activeNode = findNode(snapshot.layers, activeId);
  const target = activeNode?.mask ? snapshot.target : 'layer';
  return {
    ...snapshot,
    groupStack: validStack,
    activeId,
    target
  };
}

function mapNode(nodes: readonly LayerNode[], id: string, transform: (node: LayerNode) => LayerNode): LayerNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return transform(node);
    }

    if (node.children) {
      return { ...node, children: mapNode(node.children, id, transform) };
    }

    return node;
  });
}

function removeNodes(nodes: readonly LayerNode[], ids: ReadonlySet<string>): LayerNode[] {
  return nodes
    .filter((node) => !ids.has(node.id))
    .map((node) => (node.children ? { ...node, children: removeNodes(node.children, ids) } : node));
}

function insertBeside(
  nodes: readonly LayerNode[],
  targetId: string,
  item: LayerNode,
  side: 'before' | 'after'
): LayerNode[] {
  const index = nodes.findIndex((node) => node.id === targetId);
  if (index >= 0) {
    const at = side === 'before' ? index : index + 1;
    return [...nodes.slice(0, at), item, ...nodes.slice(at)];
  }

  return nodes.map((node) =>
    node.children ? { ...node, children: insertBeside(node.children, targetId, item, side) } : node
  );
}

function insertIntoParent(
  nodes: readonly LayerNode[],
  parentId: string | undefined,
  index: number,
  item: LayerNode
): LayerNode[] {
  if (!parentId) {
    const at = clamp(index, 0, nodes.length);
    return [...nodes.slice(0, at), item, ...nodes.slice(at)];
  }

  return mapNode(nodes, parentId, (parent) => {
    const children = parent.children ?? [];
    const at = clamp(index, 0, children.length);
    return { ...parent, children: [...children.slice(0, at), item, ...children.slice(at)] };
  });
}

function insertAboveActive(
  nodes: readonly LayerNode[],
  activeId: string,
  groupStack: readonly string[],
  item: LayerNode
): LayerNode[] {
  if (findNode(nodes, activeId)) {
    return insertBeside(nodes, activeId, item, 'before');
  }

  return insertIntoParent(nodes, groupStack.at(-1), 0, item);
}

function collectIds(nodes: readonly LayerNode[]): string[] {
  return nodes.flatMap((node) => [node.id, ...(node.children ? collectIds(node.children) : [])]);
}

function hasSelectedAncestor(nodes: readonly LayerNode[], id: string, selected: ReadonlySet<string>): boolean {
  let located = findNodeWithParent(nodes, id);
  while (located?.parentId) {
    if (selected.has(located.parentId)) {
      return true;
    }

    located = findNodeWithParent(nodes, located.parentId);
  }

  return false;
}

function cloneNode(node: LayerNode, makeId: () => string): LayerNode {
  return {
    ...node,
    id: makeId(),
    locks: { ...node.locks },
    mask: node.mask ? { ...node.mask } : undefined,
    blendIf: {
      thisLayer: [...node.blendIf.thisLayer],
      underlying: [...node.blendIf.underlying]
    },
    children: node.children?.map((child) => cloneNode(child, makeId))
  };
}

/** Realistic PSD-like starter document with procedural SVG thumbnails. */
function initialSnapshot(): PrototypeSnapshot {
  return {
    layers: [
      {
        id: 'layer-glow',
        name: 'Glow',
        type: 'raster',
        visible: true,
        blend: 'screen',
        opacity: 75,
        fill: 100,
        clipping: false,
        reference: false,
        locks: emptyLocks(),
        colorTag: 'none',
        thumb: thumbGlow(),
        mask: { thumb: thumbMaskSoft(false), enabled: true, linked: true, inverted: false },
        blendIf: defaultBlendIf()
      },
      {
        id: 'layer-curves',
        name: 'Curves',
        type: 'adjustment',
        adjustment: 'curves',
        visible: true,
        blend: 'normal',
        opacity: 100,
        fill: 100,
        clipping: false,
        reference: false,
        locks: emptyLocks(),
        colorTag: 'none',
        thumb: thumbCurves(),
        blendIf: defaultBlendIf()
      },
      {
        id: 'group-character',
        name: 'Character',
        type: 'group',
        visible: true,
        blend: 'pass-through',
        opacity: 100,
        fill: 100,
        clipping: false,
        reference: false,
        locks: emptyLocks(),
        colorTag: 'none',
        thumb: thumbGroup(),
        blendIf: defaultBlendIf(),
        children: [
          {
            id: 'layer-highlight',
            name: 'Highlight',
            type: 'raster',
            visible: true,
            blend: 'linear-dodge',
            opacity: 55,
            fill: 100,
            clipping: true,
            reference: false,
            locks: emptyLocks(),
            colorTag: 'none',
            thumb: thumbHighlight(),
            blendIf: defaultBlendIf()
          },
          {
            id: 'layer-shading',
            name: 'Shading',
            type: 'raster',
            visible: true,
            blend: 'multiply',
            opacity: 62,
            fill: 100,
            clipping: true,
            reference: false,
            locks: emptyLocks(),
            colorTag: 'none',
            thumb: thumbShading(),
            blendIf: defaultBlendIf()
          },
          {
            id: 'group-face',
            name: 'Face',
            type: 'group',
            visible: true,
            blend: 'normal',
            opacity: 100,
            fill: 100,
            clipping: false,
            reference: false,
            locks: emptyLocks(),
            colorTag: 'none',
            thumb: thumbGroup(),
            blendIf: defaultBlendIf(),
            children: [
              {
                id: 'layer-eyes',
                name: 'Eyes',
                type: 'raster',
                visible: true,
                blend: 'normal',
                opacity: 100,
                fill: 100,
                clipping: false,
                reference: false,
                locks: emptyLocks(),
                colorTag: 'none',
                thumb: thumbEyes(),
                blendIf: defaultBlendIf()
              },
              {
                id: 'layer-blush',
                name: 'Blush',
                type: 'raster',
                visible: true,
                blend: 'multiply',
                opacity: 45,
                fill: 100,
                clipping: false,
                reference: false,
                locks: emptyLocks(),
                colorTag: 'none',
                thumb: thumbBlush(),
                mask: { thumb: thumbMaskBlush(), enabled: true, linked: true, inverted: false },
                blendIf: defaultBlendIf()
              }
            ]
          },
          {
            id: 'layer-lineart',
            name: 'Lineart',
            type: 'raster',
            visible: true,
            blend: 'normal',
            opacity: 100,
            fill: 100,
            clipping: false,
            reference: true,
            locks: { alpha: true, pixels: false, position: false, all: false },
            colorTag: 'none',
            thumb: thumbLineart(),
            blendIf: defaultBlendIf()
          }
        ]
      },
      {
        id: 'layer-background',
        name: 'Background',
        type: 'raster',
        visible: true,
        blend: 'normal',
        opacity: 100,
        fill: 100,
        clipping: false,
        reference: false,
        locks: emptyLocks(),
        colorTag: 'none',
        thumb: thumbBackground(),
        blendIf: defaultBlendIf()
      }
    ],
    activeId: 'layer-shading',
    target: 'layer',
    maskOverlay: true,
    maskBrush: 'reveal',
    groupStack: [],
    expandedIds: ['group-character', 'group-face'],
    selectedIds: [],
    soloId: undefined,
    paper: { visible: true, color: '#f7f3eb', label: 'Paper' },
    favoriteBlends: ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'color']
  };
}

/** Encodes a 64×64 SVG string as a data URI for crisp transparent layer previews. */
function svgUrl(body: string) {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`;
}

function thumbGlow() {
  return svgUrl(
    '<defs><radialGradient id="g" cx="50%" cy="46%" r="42%"><stop offset="0%" stop-color="#fff4b8" stop-opacity="0.95"/><stop offset="55%" stop-color="#ffb84d" stop-opacity="0.65"/><stop offset="100%" stop-color="#ff8c00" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="30" r="26" fill="url(#g)"/>'
  );
}

function thumbCurves() {
  return svgUrl(
    '<rect x="8" y="8" width="50" height="50" rx="6" fill="#2c303a" fill-opacity="0.86"/><path d="M14 52 C24 50 28 18 52 14" fill="none" stroke="#8cb4ff" stroke-width="3.5" stroke-linecap="round"/><circle cx="26" cy="38" r="3" fill="#ffffff"/><circle cx="39" cy="22" r="3" fill="#ffffff"/>'
  );
}

function thumbHighlight() {
  return svgUrl(
    '<path d="M18 20 C26 12 39 12 46 21" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/><path d="M45 27 C49 33 47 41 42 46" fill="none" stroke="#d8f3ff" stroke-width="4" stroke-linecap="round"/>'
  );
}

function thumbShading() {
  return svgUrl(
    '<path d="M18 38 C22 52 40 56 50 42 C41 46 28 45 22 34 Z" fill="#5e4b8b" fill-opacity="0.72"/><path d="M16 26 C14 34 17 42 24 46" fill="none" stroke="#47366d" stroke-width="6" stroke-linecap="round" stroke-opacity="0.58"/>'
  );
}

function thumbEyes() {
  return svgUrl(
    '<ellipse cx="22" cy="32" rx="6" ry="5" fill="#24262c"/><ellipse cx="42" cy="32" rx="6" ry="5" fill="#24262c"/><circle cx="20" cy="30" r="1.8" fill="#ffffff"/><circle cx="40" cy="30" r="1.8" fill="#ffffff"/><path d="M15 24 Q22 20 29 24 M35 24 Q42 20 49 24" fill="none" stroke="#24262c" stroke-width="2.4" stroke-linecap="round"/>'
  );
}

function thumbBlush() {
  return svgUrl(
    '<ellipse cx="18" cy="37" rx="9" ry="5.5" fill="#f06b82" fill-opacity="0.7"/><ellipse cx="46" cy="37" rx="9" ry="5.5" fill="#f06b82" fill-opacity="0.7"/>'
  );
}

function thumbLineart() {
  return svgUrl(
    '<path d="M20 50 C14 40 15 18 32 14 C49 18 50 40 45 50" fill="none" stroke="#1f2128" stroke-width="3" stroke-linecap="round"/><path d="M22 29 C26 24 38 24 42 29" fill="none" stroke="#1f2128" stroke-width="2.4" stroke-linecap="round"/><path d="M26 42 Q32 46 38 42" fill="none" stroke="#1f2128" stroke-width="2.4" stroke-linecap="round"/>'
  );
}

function thumbBackground() {
  return svgUrl(
    '<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#bfe0d6"/><stop offset="100%" stop-color="#8bb2d9"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="6" fill="url(#bg)"/><path d="M4 46 Q22 34 38 42 T62 36 L62 62 L4 62 Z" fill="#6b9987" fill-opacity="0.55"/>'
  );
}

function thumbGroup() {
  return svgUrl(
    '<path d="M8 18 h18 l5 5 h25 v27 H8 Z" fill="#6c7486" fill-opacity="0.35" stroke="#ffffff" stroke-opacity="0.7" stroke-width="2"/>'
  );
}

function thumbMaskSoft(inverted: boolean) {
  const bg = inverted ? '#ffffff' : '#111111';
  const fg = inverted ? '#111111' : '#ffffff';
  return svgUrl(`<rect width="64" height="64" fill="${bg}"/><circle cx="32" cy="30" r="20" fill="${fg}"/>`);
}

function thumbMaskBlush() {
  return svgUrl(
    '<rect width="64" height="64" fill="#111111"/><ellipse cx="19" cy="36" rx="11" ry="8" fill="#ffffff"/><ellipse cx="45" cy="36" rx="11" ry="8" fill="#ffffff"/>'
  );
}

function thumbEmpty() {
  return svgUrl('');
}
