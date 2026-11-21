/**
 * What the layers strip (`LayersStripPart`), its properties popover and the Layers button show and edit: a stack of
 * layers, top layer first, and the commands on it. Two models implement it: the drawing's own layers
 * (`createDocumentLayers`) and the PSD-like prototype (`prototypeLayersModel` over `createMockLayers`).
 *
 * The core members are what every model offers. What only some models offer comes in two forms, and the UI shows a
 * control only where its model offers it, so that nothing looks operable and does nothing:
 *
 * - `capabilities` lists the layer properties the model keeps and the drop zones a drag may end in;
 * - a feature with its own state and commands (groups, masks, Solo, multi-selection, Paper, favourite blend modes,
 *   clearing pixels, a local undo for the strip's toast) is a member that is present only when the model offers it.
 *
 * Commands that change the document's structure (add, duplicate, delete, merge, reorder, group) wait for `ready`;
 * selecting a layer and changing its properties do not, as in the older layer parts.
 */
export type LayersModel = {
  capabilities: LayersCapabilities;
  /** Structural commands are accepted; while false the UI disables them. */
  ready: () => boolean;
  /** The layer tree, top layer first in every array. A model without groups has no `children`. */
  layers: () => readonly LayerNode[];
  activeId: () => string;
  activeLayer: () => LayerNode | undefined;
  /** Every layer and group in the tree. */
  totalCount: () => number;
  /** Makes `id` the active layer, painting on its pixels (not its mask). */
  select: (id: string) => void;
  /** Changes properties of `id`; fields the model does not keep (see `capabilities`) are ignored. */
  update: (id: string, patch: LayerPatch) => void;
  /** Adds an empty layer and makes it active. */
  addLayer: () => void;
  /** Adds a copy of `id` right above it and makes the copy active. */
  duplicate: (id: string) => void;
  /** Whether `id` may be deleted: a drawing keeps at least one layer. */
  canDelete: (id: string) => boolean;
  delete: (id: string) => void;
  /** Whether `id` has a layer below it to merge into. */
  canMergeDown: (id: string) => boolean;
  /** Merges `id` into the layer right below it, which becomes active. */
  mergeDown: (id: string) => void;
  /** Moves `dragId` to `zone` of `targetId`: above it, below it, into its group or clipped onto it. */
  reorder: (dragId: string, targetId: string, zone: ReorderZone) => void;
  /**
   * Asks for layer thumbnails about `cssSize` CSS pixels on their longer side and returns the release. Called only by
   * a mounted live view, never by a catalog preview; models whose thumbnails are always there leave it out.
   */
  wantThumbnails?: (cssSize: number) => () => void;
  /** Erases the pixels of `id`. */
  clear?: (id: string) => void;
  favoriteBlends?: {
    modes: () => readonly PsdBlendMode[];
    toggle: (mode: PsdBlendMode) => void;
  };
  /** Several layers selected at once by a swipe, and what can be done to all of them. */
  selection?: {
    ids: () => readonly string[];
    toggle: (id: string) => void;
    clear: () => void;
    delete: (ids: readonly string[]) => void;
  };
  /** One layer shown alone (long press on its eye) without changing any layer's own visibility. */
  solo?: {
    id: () => string | undefined;
    toggle: (id: string) => void;
  };
  groups?: LayerGroups;
  masks?: LayerMasks;
  paper?: {
    state: () => PaperState;
    set: (patch: Partial<PaperState>) => void;
  };
  /** An undo of the model's own, for the toast after a gesture such as pinch-to-group; the drawing uses the board's. */
  localUndo?: {
    canUndo: () => boolean;
    undo: () => void;
  };
};

/** The layer properties a model keeps and the drop zones a drag may end in. */
export type LayersCapabilities = {
  /** The blend modes offered for layers; groups also take the `groupOnly` ones. */
  blendModes: readonly BlendModeInfo[];
  /** The lock kinds offered. */
  locks: readonly LayerLockKind[];
  clipping: boolean;
  /** Fill opacity, which leaves layer effects at full strength. */
  fill: boolean;
  blendIf: boolean;
  colorTags: boolean;
  /** Marking a layer as the reference that fills and selections read. */
  reference: boolean;
  /** Where a dragged tile may land: above (`before`) or below (`after`) another, into a group, clipped onto a layer. */
  dropZones: readonly ReorderZone[];
};

/** Folders of layers: drill-in in the narrow strip, an expandable tree in the wide one. */
export type LayerGroups = {
  /**
   * Folders blend but have nothing else a layer has: a blend mode, Pass Through too, and an opacity, and they can be
   * the clipping base of the layers right above them (a clip drop onto a folder), but they have no locks, mask or
   * clipping of their own and cannot merge. The properties popover then offers a folder its blending and visibility in
   * place of the layer toggles, and Ungroup in place of Merge. Without it a folder has everything a layer has, as in the
   * prototype.
   */
  blendOnly?: boolean;
  /** The groups the narrow strip has entered, outermost first. */
  stack: () => readonly string[];
  /** The groups open in the wide tree. */
  expandedIds: () => readonly string[];
  /** Adds an empty group above the active layer. */
  add: () => void;
  enter: (id: string) => void;
  exit: () => void;
  toggleExpand: (id: string) => void;
  /** Puts `ids` into a new group at the topmost one's place. */
  group: (ids: readonly string[]) => void;
  /** Moves `id` out of its group to right above the group. */
  moveOut: (id: string) => void;
  /** Puts the contents of group `id` in its place, in their order, and removes the group. */
  ungroup?: (id: string) => void;
};

/** Layer masks and painting on them, with the red overlay that shows a mask on the canvas. */
export type LayerMasks = {
  /** Whether the brush paints the active layer's pixels or its mask. */
  target: () => 'layer' | 'mask';
  /** The red overlay is shown while painting a mask. */
  overlay: () => boolean;
  /** Whether painting on the mask reveals (white) or hides (black). */
  brush: () => 'reveal' | 'hide';
  /** Makes `id` active and paints on its pixels or its mask. */
  setTarget: (id: string, target: 'layer' | 'mask') => void;
  /** Leaves the mask and paints on the active layer's pixels again. */
  exit: () => void;
  add: (id: string) => void;
  toggleEnabled: (id: string) => void;
  invert: (id: string) => void;
  remove: (id: string) => void;
  toggleOverlay: () => void;
  setBrush: (brush: 'reveal' | 'hide') => void;
};

/** One node of the layer tree as the layers UI shows it. Properties a model does not keep hold their defaults. */
export type LayerNode = {
  id: string;
  name: string;
  type: 'raster' | 'group' | 'adjustment';
  adjustment?: 'curves' | 'levels' | 'hue-sat';
  visible: boolean;
  blend: PsdBlendMode;
  /** Opacity in percent, `0..100`. */
  opacity: number;
  /** Fill opacity in percent, `0..100`. */
  fill: number;
  clipping: boolean;
  reference: boolean;
  locks: LayerLocks;
  colorTag: LayerColorTag;
  /** The layer's picture as an image URL; undefined while there is none, as before the engine has made one. */
  thumb: string | undefined;
  mask?: LayerMask;
  blendIf: {
    thisLayer: BlendIfRange;
    underlying: BlendIfRange;
  };
  children?: readonly LayerNode[];
};

/** The properties `LayersModel.update` changes; `locks` merges into the current ones. */
export type LayerPatch = Partial<
  Pick<LayerNode, 'name' | 'visible' | 'blend' | 'opacity' | 'fill' | 'clipping' | 'reference' | 'colorTag' | 'blendIf'>
> & {
  locks?: Partial<LayerLocks>;
};

/** Where a dragged tile lands relative to the tile under it. */
export type ReorderZone = 'before' | 'after' | 'into' | 'clip';

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

/** The PSD locks: transparent pixels, all pixels, position, everything. */
export type LayerLocks = {
  alpha: boolean;
  pixels: boolean;
  position: boolean;
  all: boolean;
};

export type LayerLockKind = keyof LayerLocks;

export type LayerMask = {
  thumb: string;
  enabled: boolean;
  linked: boolean;
  inverted: boolean;
};

/** Locks all off. */
export function emptyLocks(): LayerLocks {
  return { alpha: false, pixels: false, position: false, all: false };
}

/** Default Blend If ranges: full 0..255 with unsplit paired handles. */
export function defaultBlendIf(): LayerNode['blendIf'] {
  return {
    thisLayer: [0, 0, 255, 255],
    underlying: [0, 0, 255, 255]
  };
}

/** Finds node `id` anywhere in the layer tree. */
export function findNode(nodes: readonly LayerNode[], id: string): LayerNode | undefined {
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
  nodes: readonly LayerNode[],
  id: string,
  parentId?: string
): { node: LayerNode; parentId: string | undefined; siblings: readonly LayerNode[]; index: number } | undefined {
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
  nodes: readonly LayerNode[],
  expandedIds: readonly string[],
  depth = 0,
  parentId?: string
): { node: LayerNode; depth: number; parentId: string | undefined }[] {
  const expanded = new Set(expandedIds);
  const rows: { node: LayerNode; depth: number; parentId: string | undefined }[] = [];
  for (const node of nodes) {
    rows.push({ node, depth, parentId });
    if (node.type === 'group' && node.children && expanded.has(node.id)) {
      rows.push(...flattenVisibleTree(node.children, expandedIds, depth + 1, node.id));
    }
  }

  return rows;
}

/** Resolves the current folder's children and group breadcrumb for the narrow strip view. */
export function nodesAtGroupStack(nodes: readonly LayerNode[], stack: readonly string[]) {
  let items = nodes;
  const breadcrumb: LayerNode[] = [];
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
export function countLayers(nodes: readonly LayerNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + (node.children ? countLayers(node.children) : 0), 0);
}

/** Whether `node` is effectively visible taking `soloId` into account. */
export function isEffectivelyVisible(nodes: readonly LayerNode[], node: LayerNode, soloId: string | undefined) {
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
