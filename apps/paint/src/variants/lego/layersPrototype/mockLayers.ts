import { createMemo } from 'solid-js';
import { createImmediateSignal } from '../../../shared/createImmediateSignal';

/** All 27 Photoshop-compatible PSD blend modes plus Pass Through for groups. */
export type PsdBlendMode =
  | 'pass-through'
  | 'normal'
  | 'dissolve'
  | 'darken'
  | 'multiply'
  | 'color-burn'
  | 'linear-burn'
  | 'darker-color'
  | 'lighten'
  | 'screen'
  | 'color-dodge'
  | 'linear-dodge'
  | 'lighter-color'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'vivid-light'
  | 'linear-light'
  | 'pin-light'
  | 'hard-mix'
  | 'difference'
  | 'exclusion'
  | 'subtract'
  | 'divide'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/** Semantic groups matching Photoshop's blend mode dropdown. */
export type BlendModeGroup = 'Normal' | 'Darken' | 'Lighten' | 'Contrast' | 'Inversion' | 'Component';

/** Metadata for one PSD blend mode: display label, compact strip badge, and group. */
export type BlendModeInfo = {
  id: PsdBlendMode;
  label: string;
  short: string;
  group: BlendModeGroup;
  groupOnly?: true;
};

/** Ordered catalog of PSD blend modes (Pass Through + 27 layer modes). */
export const psdBlendModes: readonly BlendModeInfo[] = [
  { id: 'pass-through', label: 'Pass Through', short: 'PT', group: 'Normal', groupOnly: true },
  { id: 'normal', label: 'Normal', short: 'N', group: 'Normal' },
  { id: 'dissolve', label: 'Dissolve', short: 'Dis', group: 'Normal' },
  { id: 'darken', label: 'Darken', short: 'Dk', group: 'Darken' },
  { id: 'multiply', label: 'Multiply', short: 'M', group: 'Darken' },
  { id: 'color-burn', label: 'Color Burn', short: 'CB', group: 'Darken' },
  { id: 'linear-burn', label: 'Linear Burn', short: 'LB', group: 'Darken' },
  { id: 'darker-color', label: 'Darker Color', short: 'DC', group: 'Darken' },
  { id: 'lighten', label: 'Lighten', short: 'Lt', group: 'Lighten' },
  { id: 'screen', label: 'Screen', short: 'Sc', group: 'Lighten' },
  { id: 'color-dodge', label: 'Color Dodge', short: 'CD', group: 'Lighten' },
  { id: 'linear-dodge', label: 'Linear Dodge (Add)', short: 'Add', group: 'Lighten' },
  { id: 'lighter-color', label: 'Lighter Color', short: 'LC', group: 'Lighten' },
  { id: 'overlay', label: 'Overlay', short: 'Ov', group: 'Contrast' },
  { id: 'soft-light', label: 'Soft Light', short: 'SL', group: 'Contrast' },
  { id: 'hard-light', label: 'Hard Light', short: 'HL', group: 'Contrast' },
  { id: 'vivid-light', label: 'Vivid Light', short: 'VL', group: 'Contrast' },
  { id: 'linear-light', label: 'Linear Light', short: 'LL', group: 'Contrast' },
  { id: 'pin-light', label: 'Pin Light', short: 'PL', group: 'Contrast' },
  { id: 'hard-mix', label: 'Hard Mix', short: 'HM', group: 'Contrast' },
  { id: 'difference', label: 'Difference', short: 'Df', group: 'Inversion' },
  { id: 'exclusion', label: 'Exclusion', short: 'Ex', group: 'Inversion' },
  { id: 'subtract', label: 'Subtract', short: 'Sb', group: 'Inversion' },
  { id: 'divide', label: 'Divide', short: 'Dv', group: 'Inversion' },
  { id: 'hue', label: 'Hue', short: 'H', group: 'Component' },
  { id: 'saturation', label: 'Saturation', short: 'S', group: 'Component' },
  { id: 'color', label: 'Color', short: 'C', group: 'Component' },
  { id: 'luminosity', label: 'Luminosity', short: 'L', group: 'Component' }
];

export const blendModeGroups: readonly BlendModeGroup[] = [
  'Normal',
  'Darken',
  'Lighten',
  'Contrast',
  'Inversion',
  'Component'
];

/** Looks up display info for a PSD blend mode. */
export function blendModeInfo(mode: PsdBlendMode): BlendModeInfo {
  return psdBlendModes.find((entry) => entry.id === mode) ?? psdBlendModes[1]!;
}

/** Optional color label on a layer tile. */
export type LayerColorTag = 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

export const layerColorTags: readonly { id: LayerColorTag; label: string; hex: string | undefined }[] = [
  { id: 'none', label: 'None', hex: undefined },
  { id: 'red', label: 'Red', hex: '#ef5350' },
  { id: 'orange', label: 'Orange', hex: '#ff9800' },
  { id: 'yellow', label: 'Yellow', hex: '#f2c94c' },
  { id: 'green', label: 'Green', hex: '#4caf7d' },
  { id: 'blue', label: 'Blue', hex: '#3d7eff' },
  { id: 'purple', label: 'Purple', hex: '#a864fd' },
  { id: 'gray', label: 'Gray', hex: '#8e939e' }
];

/** Returns the swatch hex for `tag`, or `undefined` for `'none'`. */
export function layerColorHex(tag: LayerColorTag) {
  return layerColorTags.find((entry) => entry.id === tag)?.hex;
}

/** Paper layer state pinned at the bottom of the stack. */
export type PaperState = {
  visible: boolean;
  color: string;
  label: string;
};

export const paperPresets: readonly { label: string; color: string }[] = [
  { label: 'Cream', color: '#f7f3eb' },
  { label: 'White', color: '#ffffff' },
  { label: 'Warm gray', color: '#e5e2dc' },
  { label: 'Dark', color: '#26282e' }
];

/** Four-number PSD Blend If channel tuple: `[blackLow, blackHigh, whiteLow, whiteHigh]` in `0..255`. */
export type BlendIfRange = [number, number, number, number];

export type LayerLocks = {
  alpha: boolean;
  pixels: boolean;
  position: boolean;
  all: boolean;
};

export type LayerMask = {
  thumb: string;
  enabled: boolean;
  linked: boolean;
  inverted: boolean;
};

/** One node in the prototype PSD layer tree. Topmost layer comes first in every array. */
export type MockLayerNode = {
  id: string;
  name: string;
  type: 'raster' | 'group' | 'adjustment';
  adjustment?: 'curves' | 'levels' | 'hue-sat';
  visible: boolean;
  blend: PsdBlendMode;
  opacity: number;
  fill: number;
  clipping: boolean;
  reference: boolean;
  locks: LayerLocks;
  colorTag: LayerColorTag;
  thumb: string;
  mask?: LayerMask;
  blendIf: {
    thisLayer: BlendIfRange;
    underlying: BlendIfRange;
  };
  children?: MockLayerNode[];
};

export type ReorderZone = 'before' | 'after' | 'into' | 'clip';

export type MockLayerPatch = Partial<
  Pick<
    MockLayerNode,
    'name' | 'visible' | 'blend' | 'opacity' | 'fill' | 'clipping' | 'reference' | 'colorTag' | 'blendIf'
  >
> & {
  locks?: Partial<LayerLocks>;
};

type PrototypeSnapshot = {
  layers: MockLayerNode[];
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
      const created: MockLayerNode = {
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
      const created: MockLayerNode = {
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
    update(id: string, patch: MockLayerPatch) {
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
      commit((current) => ({
        ...current,
        soloId: current.soloId === id ? undefined : id
      }), false);
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
          .filter((node): node is MockLayerNode => node !== undefined);
        const stripped = removeNodes(current.layers, topSet);
        const group: MockLayerNode = {
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
          const moved: MockLayerNode = { ...dragged, clipping: false };
          return {
            ...current,
            layers: insertIntoParent(stripped, targetId, 0, moved),
            expandedIds: unique([...current.expandedIds, targetId])
          };
        }

        if (zone === 'clip') {
          const moved: MockLayerNode = { ...dragged, clipping: true };
          return {
            ...current,
            layers: insertBeside(stripped, targetId, moved, 'before')
          };
        }

        const moved: MockLayerNode = { ...dragged, clipping: zone === 'before' ? dragged.clipping : false };
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

/** Finds node `id` anywhere in the layer tree. */
export function findNode(nodes: readonly MockLayerNode[], id: string): MockLayerNode | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    if (node.children) {
      const found = findNode(node.children, id);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

/** Finds node `id` along with its parent group id, sibling array, and index. */
export function findNodeWithParent(
  nodes: readonly MockLayerNode[],
  id: string,
  parentId?: string
): { node: MockLayerNode; parentId: string | undefined; siblings: readonly MockLayerNode[]; index: number } | undefined {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!;
    if (node.id === id) {
      return { node, parentId, siblings: nodes, index };
    }

    if (node.children) {
      const found = findNodeWithParent(node.children, id, node.id);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

/** Flattens the visible tree for the wide indented view, respecting `expandedIds`. */
export function flattenVisibleTree(
  nodes: readonly MockLayerNode[],
  expandedIds: readonly string[],
  depth = 0,
  parentId?: string
): { node: MockLayerNode; depth: number; parentId: string | undefined }[] {
  const expanded = new Set(expandedIds);
  const rows: { node: MockLayerNode; depth: number; parentId: string | undefined }[] = [];
  for (const node of nodes) {
    rows.push({ node, depth, parentId });
    if (node.type === 'group' && node.children && expanded.has(node.id)) {
      rows.push(...flattenVisibleTree(node.children, expandedIds, depth + 1, node.id));
    }
  }

  return rows;
}

/** Resolves the current folder's children and group breadcrumb for the narrow strip view. */
export function nodesAtGroupStack(nodes: readonly MockLayerNode[], stack: readonly string[]) {
  let items = nodes;
  const breadcrumb: MockLayerNode[] = [];
  for (const groupId of stack) {
    const found = items.find((node) => node.id === groupId && node.type === 'group');
    if (!found) {
      break;
    }

    breadcrumb.push(found);
    items = found.children ?? [];
  }

  return { items, currentGroup: breadcrumb.at(-1), breadcrumb };
}

/** Counts every node (layers and groups) in the tree. */
export function countLayers(nodes: readonly MockLayerNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + (node.children ? countLayers(node.children) : 0), 0);
}

/** Whether `node` is effectively visible taking `soloId` into account. */
export function isEffectivelyVisible(
  nodes: readonly MockLayerNode[],
  node: MockLayerNode,
  soloId: string | undefined
) {
  if (!soloId) {
    return node.visible;
  }

  if (node.id === soloId) {
    return true;
  }

  // Keep ancestors and descendants of the soloed node visible so the soloed group/layer reads clearly.
  const soloNode = findNode(nodes, soloId);
  if (soloNode && findNode([soloNode], node.id)) {
    return true;
  }

  if (node.children && findNode(node.children, soloId)) {
    return true;
  }

  return false;
}

/** Default Blend If ranges: full 0..255 with unsplit paired handles. */
export function defaultBlendIf(): MockLayerNode['blendIf'] {
  return {
    thisLayer: [0, 0, 255, 255],
    underlying: [0, 0, 255, 255]
  };
}

const maxUndoSteps = 30;

function emptyLocks(): LayerLocks {
  return { alpha: false, pixels: false, position: false, all: false };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function unique<T>(items: readonly T[]) {
  return [...new Set(items)];
}

function normalizeSnapshot(snapshot: PrototypeSnapshot): PrototypeSnapshot {
  const validStack: string[] = [];
  let current = snapshot.layers;
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

function mapNode(
  nodes: readonly MockLayerNode[],
  id: string,
  transform: (node: MockLayerNode) => MockLayerNode
): MockLayerNode[] {
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

function removeNodes(nodes: readonly MockLayerNode[], ids: ReadonlySet<string>): MockLayerNode[] {
  return nodes
    .filter((node) => !ids.has(node.id))
    .map((node) => (node.children ? { ...node, children: removeNodes(node.children, ids) } : node));
}

function insertBeside(
  nodes: readonly MockLayerNode[],
  targetId: string,
  item: MockLayerNode,
  side: 'before' | 'after'
): MockLayerNode[] {
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
  nodes: readonly MockLayerNode[],
  parentId: string | undefined,
  index: number,
  item: MockLayerNode
): MockLayerNode[] {
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
  nodes: readonly MockLayerNode[],
  activeId: string,
  groupStack: readonly string[],
  item: MockLayerNode
): MockLayerNode[] {
  if (findNode(nodes, activeId)) {
    return insertBeside(nodes, activeId, item, 'before');
  }

  return insertIntoParent(nodes, groupStack.at(-1), 0, item);
}

function collectIds(nodes: readonly MockLayerNode[]): string[] {
  return nodes.flatMap((node) => [node.id, ...(node.children ? collectIds(node.children) : [])]);
}

function hasSelectedAncestor(nodes: readonly MockLayerNode[], id: string, selected: ReadonlySet<string>): boolean {
  let located = findNodeWithParent(nodes, id);
  while (located?.parentId) {
    if (selected.has(located.parentId)) {
      return true;
    }

    located = findNodeWithParent(nodes, located.parentId);
  }

  return false;
}

function cloneNode(node: MockLayerNode, makeId: () => string): MockLayerNode {
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
