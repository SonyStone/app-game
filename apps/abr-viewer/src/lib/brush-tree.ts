/**
 * MARK: Types
 *
 * Tree data model for the unified Photoshop-style brush panel.
 * Converts flat AbrFile + HierarchyItem[] into a nested tree structure,
 * and back again for export.
 */

import type { AbrFile, HierarchyItem } from '@app-game/abr-parser/browser';
import type { AbrFileWithMeta, BrushWithPreview } from './abr';

// ============================================================================
// MARK: Tree Node Types
// ============================================================================

/** Base fields shared by all tree nodes */
type TreeNodeBase = {
  id: string;
  name: string;
  expanded: boolean;
};

/** A group node (folder) in the tree. Can contain brushes and sub-groups. */
export type GroupNode = TreeNodeBase & {
  kind: 'group';
  children: TreeNode[];
  /** UUID from phry block (for sub-folders), undefined for file-level groups */
  uuid?: string;
  /** The original AbrFile for file-level groups (top-level only) */
  sourceFile?: AbrFileWithMeta;
};

/** A brush leaf node */
export type BrushNode = TreeNodeBase & {
  kind: 'brush';
  brush: BrushWithPreview;
};

/** Any node in the brush tree */
export type TreeNode = GroupNode | BrushNode;

/** Virtual root node wrapping all top-level file groups. Used by solid-nest as the tree root. */
export const ROOT_ID = '__root__';

/** Create a virtual root GroupNode wrapping top-level groups */
export function createRootNode(children: TreeNode[] = []): GroupNode {
  return {
    id: ROOT_ID,
    kind: 'group',
    name: 'Root',
    expanded: true,
    children
  };
}

// ============================================================================
// MARK: Tree Building — from AbrFile to TreeNode[]
// ============================================================================

let nextId = 1;
function uid(prefix: string = 'node'): string {
  return `${prefix}_${nextId++}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Reset the ID counter (useful for tests) */
export function resetIdCounter(): void {
  nextId = 1;
}

/**
 * Build a tree for a single loaded ABR file.
 * Returns a single top-level GroupNode representing the file.
 */
export function buildTreeFromFile(file: AbrFileWithMeta): GroupNode {
  const hierarchy = file.hierarchy;
  const brushes = file.brushes as BrushWithPreview[];

  // If no hierarchy, just put all brushes flat inside the file group
  if (!hierarchy || hierarchy.length === 0) {
    return {
      id: uid('file'),
      kind: 'group',
      name: file.fileName ?? 'Untitled.abr',
      expanded: false,
      sourceFile: file,
      children: brushes.map((b) => brushToNode(b))
    };
  }

  // Walk the flat hierarchy list and build nested groups
  let brushIndex = 0;
  const rootChildren: TreeNode[] = [];
  const stack: GroupNode[] = [];

  const currentContainer = (): TreeNode[] => {
    return stack.length > 0 ? stack[stack.length - 1]!.children : rootChildren;
  };

  for (const item of hierarchy) {
    switch (item.type) {
      case 'group': {
        const group: GroupNode = {
          id: uid('group'),
          kind: 'group',
          name: item.name ?? 'Unnamed Group',
          expanded: false,
          uuid: item.uuid,
          children: []
        };
        currentContainer().push(group);
        stack.push(group);
        break;
      }
      case 'groupEnd': {
        stack.pop();
        break;
      }
      case 'preset': {
        if (brushIndex < brushes.length) {
          currentContainer().push(brushToNode(brushes[brushIndex]!));
          brushIndex++;
        }
        break;
      }
    }
  }

  // Any remaining brushes not referenced by hierarchy
  while (brushIndex < brushes.length) {
    rootChildren.push(brushToNode(brushes[brushIndex]!));
    brushIndex++;
  }

  return {
    id: uid('file'),
    kind: 'group',
    name: file.fileName ?? 'Untitled.abr',
    expanded: false,
    sourceFile: file,
    children: rootChildren
  };
}

function brushToNode(brush: BrushWithPreview): BrushNode {
  return {
    id: uid('brush'),
    kind: 'brush',
    name: brush.name,
    expanded: false,
    brush
  };
}

// ============================================================================
// MARK: Tree → AbrFile (for export)
// ============================================================================

/**
 * Collect all brushes from a subtree in depth-first order.
 */
export function collectBrushes(node: TreeNode): BrushWithPreview[] {
  if (node.kind === 'brush') return [node.brush];
  return node.children.flatMap(collectBrushes);
}

/**
 * Build a flat HierarchyItem[] from a group's children (depth-first).
 * Only emits hierarchy items if there are actual sub-groups.
 */
export function buildHierarchyItems(group: GroupNode): HierarchyItem[] | undefined {
  const hasSubGroups = group.children.some((c) => c.kind === 'group');
  if (!hasSubGroups) return undefined;

  const items: HierarchyItem[] = [];
  for (const child of group.children) {
    if (child.kind === 'brush') {
      items.push({ type: 'preset' });
    } else {
      items.push({ type: 'group', name: child.name, uuid: child.uuid });
      // Recurse into sub-group children
      for (const grandchild of child.children) {
        if (grandchild.kind === 'brush') {
          items.push({ type: 'preset' });
        } else {
          // Nested sub-groups: recurse
          const nested = buildHierarchyFromGroup(grandchild);
          items.push(...nested);
        }
      }
      items.push({ type: 'groupEnd' });
    }
  }
  return items;
}

function buildHierarchyFromGroup(group: GroupNode): HierarchyItem[] {
  const items: HierarchyItem[] = [];
  items.push({ type: 'group', name: group.name, uuid: group.uuid });
  for (const child of group.children) {
    if (child.kind === 'brush') {
      items.push({ type: 'preset' });
    } else {
      items.push(...buildHierarchyFromGroup(child));
    }
  }
  items.push({ type: 'groupEnd' });
  return items;
}

/**
 * Convert a GroupNode (file-level or sub-group) into an AbrFile suitable
 * for writing with AbrWriter.
 */
export function groupToAbrFile(group: GroupNode): AbrFile {
  const brushes = collectBrushes(group);
  const hierarchy = buildHierarchyItems(group);

  // Start from the source file if we have one (preserves patterns, raw data, etc.)
  const base = group.sourceFile;

  return {
    version: base?.version ?? 6,
    subVersion: base?.subVersion ?? 2,
    brushes,
    patterns: base?.patterns,
    rawPatternData: base?.rawPatternData,
    rawSampleData: base?.rawSampleData,
    rawDescriptorData: undefined, // will be regenerated by writer
    rawHierarchyData: undefined, // will be regenerated from hierarchy items
    hierarchy,
    errors: []
  };
}

// ============================================================================
// MARK: Tree Manipulation Helpers
// ============================================================================

/**
 * Deep-clone a tree node (produces new IDs).
 */
export function cloneNode(node: TreeNode): TreeNode {
  if (node.kind === 'brush') {
    return {
      ...node,
      id: uid('brush'),
      brush: {
        ...node.brush,
        id: `brush_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      }
    };
  }
  return {
    ...node,
    id: uid('group'),
    children: node.children.map(cloneNode)
  };
}

/**
 * Find a node by ID in a tree array. Returns [node, parent, indexInParent].
 */
export function findNode(
  roots: TreeNode[],
  id: string
): { node: TreeNode; parent: GroupNode | null; index: number } | null {
  for (const [i, node] of roots.entries()) {
    if (node.id === id) {
      return { node, parent: null, index: i };
    }
    if (node.kind === 'group') {
      const found = findNodeInGroup(node, id);
      if (found) return found;
    }
  }
  return null;
}

function findNodeInGroup(group: GroupNode, id: string): { node: TreeNode; parent: GroupNode; index: number } | null {
  for (const [i, node] of group.children.entries()) {
    if (node.id === id) {
      return { node, parent: group, index: i };
    }
    if (node.kind === 'group') {
      const found = findNodeInGroup(node, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Remove a node by ID from the tree. Returns the removed node or null.
 */
export function removeNode(roots: TreeNode[], id: string): TreeNode | null {
  for (const [i, node] of roots.entries()) {
    if (node.id === id) {
      return roots.splice(i, 1)[0]!;
    }
    if (node.kind === 'group') {
      const removed = removeNode((node).children, id);
      if (removed) return removed;
    }
  }
  return null;
}

/**
 * Insert a node into the tree at the specified position.
 * `targetId` = the node to insert before/after/into.
 * `position` = 'before' | 'after' | 'inside' (only for groups).
 */
export function insertNode(
  roots: TreeNode[],
  node: TreeNode,
  targetId: string,
  position: 'before' | 'after' | 'inside'
): boolean {
  if (position === 'inside') {
    // Find target group and append inside
    const found = findNode(roots, targetId);
    if (found && found.node.kind === 'group') {
      (found.node).children.push(node);
      return true;
    }
    return false;
  }

  // Before / after
  for (const [i, candidate] of roots.entries()) {
    if (candidate.id === targetId) {
      const idx = position === 'before' ? i : i + 1;
      roots.splice(idx, 0, node);
      return true;
    }
    if (candidate.kind === 'group') {
      if (insertNode(candidate.children, node, targetId, position)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Count total brushes in a set of tree roots.
 */
export function countBrushes(nodes: TreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.kind === 'brush') count++;
    else count += countBrushes(node.children);
  }
  return count;
}

/**
 * Get all brush nodes (flat) from a tree.
 */
export function allBrushNodes(nodes: TreeNode[]): BrushNode[] {
  const result: BrushNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'brush') result.push(node);
    else result.push(...allBrushNodes(node.children));
  }
  return result;
}

/**
 * Filter brush nodes by search query, preserving group structure.
 * Empty groups are pruned. Returns new tree (non-mutating).
 */
export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes;
  const q = query.toLowerCase();

  return nodes
    .map((node): TreeNode | null => {
      if (node.kind === 'brush') {
        const matches =
          node.brush.name.toLowerCase().includes(q) ||
          node.brush.type.toLowerCase().includes(q) ||
          node.brush.id.toLowerCase().includes(q);
        return matches ? node : null;
      }
      // Group: filter children recursively
      const filteredChildren = filterTree(node.children, query);
      // Also match on group name
      if (node.name.toLowerCase().includes(q)) return node;
      if (filteredChildren.length === 0) return null;
      return { ...node, children: filteredChildren };
    })
    .filter((n): n is TreeNode => n !== null);
}

// ============================================================================
// MARK: Store Mutation Helpers (for solid-nest + produce)
// ============================================================================

/**
 * Find a node by ID in a tree (mutable in-place search).
 * Used inside `produce` callbacks for store mutations.
 */
function findNodeMut(node: TreeNode, id: string): TreeNode | undefined {
  if (node.id === id) return node;
  if (node.kind === 'group') {
    for (const child of node.children) {
      const found = findNodeMut(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Remove blocks by their IDs from a tree. Mutates in-place.
 * Optionally collects removed blocks into `collect`.
 */
export function removeBlocksById(root: TreeNode, ids: string[], collect?: TreeNode[]): void {
  if (root.kind !== 'group') return;
  root.children = root.children.filter((child) => {
    if (ids.includes(child.id)) {
      collect?.push(child);
      return false;
    }
    removeBlocksById(child, ids, collect);
    return true;
  });
}

/**
 * Insert blocks at a specific place (parent + before sibling).
 * Matches solid-nest's `Place<string>` shape: `{ parent, before }`.
 */
export function insertBlocksAtPlace(
  root: TreeNode,
  blocks: TreeNode[],
  place: { parent: string; before: string | null }
): void {
  const parent = findNodeMut(root, place.parent);
  if (!parent || parent.kind !== 'group') return;

  if (place.before !== null) {
    const idx = parent.children.findIndex((c) => c.id === place.before);
    if (idx >= 0) {
      parent.children.splice(idx, 0, ...blocks);
    } else {
      parent.children.push(...blocks);
    }
  } else {
    parent.children.push(...blocks);
  }
}
