import type { DocumentNode, GroupBlendMode, Layer, LayerGroup } from './document';
import type { LayerMask } from './layerMask';

/**
 * The layer tree of a drawing is one list of nodes, raster layers and folders, each naming the folder it is in by
 * `parentId` (none at the root). Siblings run bottom to top in the order the list has them. The document keeps the
 * list in canonical order: every folder right after its children, so that a folder's subtree is one run of the list
 * that ends with the folder, and the raster layers, read in list order, are in compositing order.
 */

/** Folders nest at most this deep: no node has more folders above it. */
export const MAX_FOLDER_DEPTH = 10;

/** A drawing holds at most this many folders, beside its raster layers. */
export const MAX_FOLDERS = 128;

/**
 * Where a node goes in the layer tree: into folder `parentId`, `null` for the root, right above or below its child
 * `anchorId`; without an anchor, at the top (`above`) or the bottom (`below`) of the folder.
 */
export type LayerPlace = { parentId: string | null; anchorId?: string; side: 'above' | 'below' };

/** What the tree reads of a node: a document node, a saved one or one of the UI state's. */
export type TreeNode = { id: string; parentId?: string; kind?: 'raster' | 'group' };

/** Key of the root in a children index; never a node id, which is never empty. */
const ROOT = '';

/**
 * Validates the tree of `nodes` and returns them in canonical order, keeping the order of siblings. Throws, naming
 * the problem, for an empty or repeated id, a parent that is missing or not a folder, a folder inside itself, or
 * folders nested deeper than {@link MAX_FOLDER_DEPTH}.
 */
export function orderLayerTree<T extends TreeNode>(nodes: readonly T[]): T[] {
  const tree = layerTree(nodes);
  const ordered: T[] = [];
  const emit = (key: string) => {
    for (const child of tree.children.get(key)!) {
      if (child.kind === 'group') {
        emit(child.id);
      }

      ordered.push(child);
    }
  };
  emit(ROOT);
  return ordered;
}

/**
 * The validated tree of `nodes` (see {@link orderLayerTree} for what throws): nodes by id, and each folder's children
 * bottom first by folder id, the root's under `''`.
 */
export function layerTree<T extends TreeNode>(nodes: readonly T[]) {
  const byId = new Map<string, T>();
  for (const node of nodes) {
    if (!node.id || byId.has(node.id)) {
      throw new Error('Invalid layer identifiers.');
    }

    byId.set(node.id, node);
  }

  const children = new Map<string, T[]>([[ROOT, []]]);
  for (const node of nodes) {
    if (node.kind === 'group') {
      children.set(node.id, []);
    }
  }

  for (const node of nodes) {
    if (node.parentId !== undefined && byId.get(node.parentId)?.kind !== 'group') {
      throw new Error('A layer is inside something that is not a folder.');
    }

    children.get(node.parentId ?? ROOT)!.push(node);
  }

  for (const node of nodes) {
    const chain = new Set([node.id]);
    for (let id = node.parentId; id !== undefined; id = byId.get(id)!.parentId) {
      if (chain.has(id)) {
        throw new Error('A folder cannot be inside itself.');
      }

      chain.add(id);
      if (chain.size - 1 > MAX_FOLDER_DEPTH) {
        throw new Error(`Folders can be nested at most ${MAX_FOLDER_DEPTH} deep.`);
      }
    }
  }

  return { byId, children };
}

/** Key of `parentId` in a children index: the folder's id, or `''` for the root. */
export function parentKey(parentId: string | null | undefined): string {
  return parentId ?? ROOT;
}

/**
 * The raster layers of `nodes`, in canonical order, as they show on the canvas: a raster inside a hidden folder
 * reads as hidden, a clipped raster without a clipping base among its siblings reads as unclipped, and each raster
 * names the folders around it that composite on their own (`group`) and the folder it is clipped to (`clipGroup`).
 *
 * Clipping is resolved among siblings, as Photoshop does (see {@link clipBases}): a clipped raster's base is the
 * sibling right below it, a raster or a folder, or that sibling's own base when it is a clipped raster too. A clipped
 * raster that is the bottom one of its folder has no base: it shows as an ordinary layer and is the base of clipped
 * rasters above it, as a clipped bottom layer of a flat drawing always has.
 *
 * A folder that is Pass Through at full strength, without an enabled mask and no clipping base composites as its
 * layers do flat, so it is left out of `group`: a drawing whose folders are all such reads as a flat stack, with no
 * `group` or `clipGroup` anywhere, and composites exactly as it did before folders could blend (see
 * {@link isFlatStack}).
 *
 * Without folders, returns `nodes` itself. Otherwise a raster that shows as it is stays the same object; one that
 * does not becomes a copy with the shown `visible` and `clipping` and its `group` and `clipGroup`, sharing its tiles.
 */
export function shownLayers(nodes: readonly DocumentNode[]): readonly ShownLayer[] {
  if (!nodes.some((node) => node.kind === 'group')) {
    return nodes as readonly Layer[];
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const shownFolders = new Map<string, boolean>();
  const folderShown = (id: string | undefined): boolean => {
    if (id === undefined) {
      return true;
    }

    let shown = shownFolders.get(id);
    if (shown === undefined) {
      const folder = byId.get(id)!;
      shown = folder.visible && folderShown(folder.parentId);
      shownFolders.set(id, shown);
    }

    return shown;
  };
  const bases = clipBases(nodes);
  const baseFolders = new Set([...bases.values()].filter((base) => base.kind === 'group').map(({ id }) => id));
  const composites = new Map<string, CompositeGroup | undefined>();
  /** The innermost folder around a node in folder `id` that composites on its own, if any. */
  const compositeOf = (id: string | undefined): CompositeGroup | undefined => {
    if (id === undefined) {
      return undefined;
    }

    if (!composites.has(id)) {
      const folder = byId.get(id) as LayerGroup;
      const parent = compositeOf(folder.parentId);
      const own = groupMode(folder) !== 'pass-through' || baseFolders.has(id);
      composites.set(
        id,
        own
          ? {
              id,
              visible: folderShown(id),
              opacity: folder.opacity,
              blend: folder.blend,
              base: baseFolders.has(id),
              ...(folder.mask?.enabled ? { mask: folder.mask } : {}),
              ...(parent ? { parent } : {})
            }
          : parent
      );
    }

    return composites.get(id);
  };
  const layers: ShownLayer[] = [];
  for (const node of nodes) {
    if (node.kind === 'group') {
      continue;
    }

    const visible = node.visible && folderShown(node.parentId);
    const base = bases.get(node.id);
    const clipping = !!node.clipping && !!base;
    const group = compositeOf(node.parentId);
    const clipGroup = base?.kind === 'group' ? compositeOf(base.id) : undefined;
    if (visible === node.visible && clipping === !!node.clipping && !group && !clipGroup) {
      layers.push(node);
      continue;
    }

    layers.push({ ...node, visible, clipping, ...(group ? { group } : {}), ...(clipGroup ? { clipGroup } : {}) });
  }

  return layers;
}

/** A raster layer as it shows on the canvas; see {@link shownLayers}. Any `Layer` is one without folders. */
export type ShownLayer = Layer & {
  /**
   * The innermost folder around the layer that composites on its own; absent when every folder around it is Pass
   * Through at full strength and no clipping base, which composite as the layers do flat.
   */
  group?: CompositeGroup;
  /** On a clipped layer whose clipping base is a folder: the layer shows only where the folder's layers cover. */
  clipGroup?: CompositeGroup;
};

/**
 * A folder as the compositors read it, shared by every raster inside it: one that blends on its own (not Pass
 * Through), fades (Pass Through below full opacity), or is the clipping base of the siblings right above it.
 */
export type CompositeGroup = {
  id: string;
  /** Whether the folder shows: it and every folder around it are visible. */
  visible: boolean;
  opacity: number;
  blend: GroupBlendMode;
  /** The nearest folder around this one that composites on its own, if any. */
  parent?: CompositeGroup;
  /**
   * Clipped siblings right above the folder use its coverage: the alpha of its layers composited on their own, after
   * the folder's visibility, before its opacity, scaled by its mask.
   */
  base: boolean;
  /** The folder's mask while it is enabled; it scales the folder's composite (see `LayerMask`). */
  mask?: LayerMask;
};

/**
 * How folder `group` composites (see `LayerGroup`): `isolated`, blending its layers' composite into the backdrop once
 * with its blend mode and opacity, for any mode but Pass Through; `fade`, Pass Through below full opacity or with an
 * enabled mask, which interpolates between the backdrop it entered with and its layers composited onto that backdrop
 * by its opacity times the mask; or `pass-through`, at full strength, which composites its layers as they are.
 */
export function groupMode(
  group: Pick<LayerGroup, 'opacity' | 'blend'> & { mask?: Pick<LayerMask, 'enabled'> }
): 'isolated' | 'fade' | 'pass-through' {
  if (group.blend !== 'pass-through') {
    return 'isolated';
  }

  return group.opacity < 1 || group.mask?.enabled ? 'fade' : 'pass-through';
}

/** The mask of `node` while it has an effect: enabled. Compositors read masks only through this. */
export function shownMask(node: { mask?: LayerMask }): LayerMask | undefined {
  return node.mask?.enabled ? node.mask : undefined;
}

/**
 * Whether `layers`, as {@link shownLayers} returns them, composite as a flat stack: no folder composites on its own
 * and no layer is clipped to a folder. Compositors keep their flat path for such a stack.
 */
export function isFlatStack(layers: readonly ShownLayer[]): boolean {
  return !layers.some((layer) => layer.group || layer.clipGroup);
}

/**
 * The clipping base of every clipped raster of `nodes` that has one, by raster id: the sibling right below it, a
 * raster or a folder, or that sibling's own base when it is a clipped raster too. A clipped raster at the bottom of
 * its folder has none, and is itself the base of the clipped rasters above it.
 */
export function clipBases(nodes: readonly DocumentNode[]): Map<string, DocumentNode> {
  /** Per folder, the base of the clipped rasters that come next: in canonical order, the latest unclipped sibling. */
  const runBase = new Map<string, DocumentNode>();
  const bases = new Map<string, DocumentNode>();
  for (const node of nodes) {
    const key = parentKey(node.parentId);
    const base = runBase.get(key);
    if (node.kind !== 'group' && node.clipping && base) {
      bases.set(node.id, base);
      continue;
    }

    runBase.set(key, node);
  }

  return bases;
}

/** Ids of node `id` and every node inside it, in canonical order; empty when there is no such node. */
export function subtreeIds(nodes: readonly TreeNode[], id: string): string[] {
  const end = nodes.findIndex((node) => node.id === id);
  if (end < 0) {
    return [];
  }

  const inside = new Set([id]);
  let start = end;
  // In canonical order the subtree is the run that ends with the node; walk back while nodes are inside it.
  while (start > 0 && inside.has(nodes[start - 1]!.parentId ?? ROOT)) {
    inside.add(nodes[--start]!.id);
  }

  return nodes.slice(start, end + 1).map((node) => node.id);
}

/** Number of folders above node `id`; 0 at the root. */
export function nodeDepth(nodes: readonly TreeNode[], id: string): number {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let depth = 0;
  for (let parent = byId.get(id)?.parentId; parent !== undefined; parent = byId.get(parent)?.parentId) {
    depth++;
  }

  return depth;
}

/**
 * The sibling right below node `id` in canonical `nodes`, if any: the node right before the node's subtree, when that
 * one is in the same folder. A folder ends its own subtree, so the sibling below a raster layer is the node right
 * before it.
 */
export function siblingBelow<T extends TreeNode>(nodes: readonly T[], id: string): T | undefined {
  const subtree = subtreeIds(nodes, id);
  if (!subtree.length) {
    return undefined;
  }

  const start = nodes.findIndex((node) => node.id === subtree[0]);
  const candidate = start > 0 ? nodes[start - 1]! : undefined;
  return candidate && candidate.parentId === nodes[start + subtree.length - 1]!.parentId ? candidate : undefined;
}

/**
 * A draft of the tree of `nodes` to edit, then read back with `result`. Nothing changes `nodes` themselves, so a
 * command that throws halfway leaves the drawing as it was. Moving a node takes its subtree along.
 */
export function editLayerTree<T extends TreeNode>(nodes: readonly T[]) {
  const tree = layerTree(nodes);
  const byId = new Map(tree.byId);
  const children = new Map([...tree.children].map(([key, list]) => [key, list.map(({ id }) => id)]));

  const detach = (id: string) => {
    const siblings = children.get(parentKey(byId.get(id)!.parentId))!;
    siblings.splice(siblings.indexOf(id), 1);
  };
  const attach = (node: T, place: LayerPlace) => {
    const key = parentKey(place.parentId);
    const siblings = children.get(key);
    if (!siblings || (place.parentId !== null && byId.get(place.parentId)?.kind !== 'group')) {
      throw new Error('There is no such folder.');
    }

    let index = place.side === 'above' ? siblings.length : 0;
    if (place.anchorId !== undefined) {
      const anchor = siblings.indexOf(place.anchorId);
      if (anchor < 0) {
        throw new Error('That layer is not in this folder.');
      }

      index = place.side === 'above' ? anchor + 1 : anchor;
    }

    siblings.splice(index, 0, node.id);
    byId.set(node.id, withParent(node, place.parentId ?? undefined));
  };

  return {
    /** Node `id` as the draft has it. */
    get: (id: string) => byId.get(id),
    /** Ids of the children of folder `parentId`, or of the root for `null`, bottom first. */
    children: (parentId: string | null): readonly string[] => children.get(parentKey(parentId)) ?? [],
    /** Adds `node`, which must be new; a folder starts empty. Throws for a place that names no folder or anchor. */
    insert(node: T, place: LayerPlace) {
      if (byId.has(node.id)) {
        throw new Error('Invalid layer identifiers.');
      }

      if (node.kind === 'group') {
        children.set(node.id, []);
      }

      attach(node, place);
    },
    /** Moves node `id` and its subtree to `place`. Throws for a missing node, a bad place or a folder into itself. */
    move(id: string, place: LayerPlace) {
      const node = byId.get(id);
      if (!node) {
        throw new Error('There is no such layer.');
      }

      for (let folder = place.parentId ?? undefined; folder !== undefined; folder = byId.get(folder)?.parentId) {
        if (folder === id) {
          throw new Error('A folder cannot go inside itself.');
        }
      }

      detach(id);
      attach(node, place);
    },
    /** Removes node `id` and its subtree. */
    remove(id: string) {
      const node = byId.get(id);
      if (!node) {
        return;
      }

      for (const child of [...(children.get(id) ?? [])]) {
        this.remove(child);
      }

      detach(id);
      children.delete(id);
      byId.delete(id);
    },
    /** The edited nodes in canonical order. Throws when the edit nested folders too deep. */
    result(): T[] {
      const ordered: T[] = [];
      const emit = (key: string) => {
        for (const id of children.get(key)!) {
          if (children.has(id)) {
            emit(id);
          }

          ordered.push(byId.get(id)!);
        }
      };
      emit(ROOT);
      layerTree(ordered);
      return ordered;
    }
  };
}

/** `node` inside folder `parentId`, or at the root without one, with no `parentId` key there. */
export function withParent<T extends { parentId?: string }>(node: T, parentId: string | undefined): T {
  if (node.parentId === parentId && (parentId !== undefined || !Object.hasOwn(node, 'parentId'))) {
    return node;
  }

  const { parentId: _previous, ...rest } = node;
  return (parentId === undefined ? rest : { ...rest, parentId }) as T;
}

/**
 * The action that moves raster layer `id` to position `index` of the drawing's raster layers, bottom first, as a panel
 * that lists only raster layers drags them: `reorder` in a drawing without folders; with folders, a `relocate` right
 * below the layer that ends up above it, or right above the topmost layer, in that layer's folder. Undefined when the
 * layer would not move or `index` is out of range.
 */
export function flatLayerMove(nodes: readonly TreeNode[], id: string, index: number): LayerMove | undefined {
  const rasters = nodes.filter((node) => node.kind !== 'group');
  const current = rasters.findIndex((node) => node.id === id);
  if (current < 0 || index === current || !Number.isInteger(index) || index < 0 || index >= rasters.length) {
    return undefined;
  }

  if (rasters.length === nodes.length) {
    return { type: 'reorder', id, index };
  }

  const others = rasters.filter((node) => node.id !== id);
  const anchor = others[Math.min(index, others.length - 1)]!;
  return {
    type: 'relocate',
    id,
    parentId: anchor.parentId ?? null,
    anchorId: anchor.id,
    side: index < others.length ? 'below' : 'above'
  };
}

/** A move `flatLayerMove` returns; both are `LayerAction`s. */
type LayerMove = { type: 'reorder'; id: string; index: number } | ({ type: 'relocate'; id: string } & LayerPlace);
