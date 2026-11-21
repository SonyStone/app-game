import type { DocumentNode, Layer } from './document';

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

/** What the tree reads of a node. */
type TreeNode = { id: string; parentId?: string; kind?: 'raster' | 'group' };

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
 * reads as hidden, and a clipped raster without a clipping base among its siblings reads as unclipped. Clipping is
 * resolved among siblings, as Photoshop does: a clipped raster's base is the raster sibling right below it, or that
 * sibling's own base when it is clipped too. A clipped raster that is the bottom one of its folder, or that has a
 * folder right below it (clipping to a folder is not supported), has no base: it shows as an ordinary layer and is
 * the base of clipped rasters above it, as a clipped bottom layer of a flat drawing always has. Folders are Pass
 * Through at full strength, so reading the result as a flat stack composites exactly as the tree does.
 *
 * Without folders, returns `nodes` itself. Otherwise a raster that shows as it is stays the same object; one that
 * does not becomes a copy with the shown `visible` and `clipping`, sharing its tiles.
 */
export function shownLayers(nodes: readonly DocumentNode[]): readonly Layer[] {
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
  /** The node seen last in each folder: in canonical order, the sibling right below the next node. */
  const below = new Map<string, DocumentNode>();
  const layers: Layer[] = [];
  for (const node of nodes) {
    const key = parentKey(node.parentId);
    if (node.kind !== 'group') {
      const visible = node.visible && folderShown(node.parentId);
      const sibling = below.get(key);
      const clipping = !!node.clipping && !!sibling && sibling.kind !== 'group';
      layers.push(visible === node.visible && clipping === !!node.clipping ? node : { ...node, visible, clipping });
    }

    below.set(key, node);
  }

  return layers;
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
