import type { AnyTreeView } from './AnyTreeView';

export type Path = number[];

// TODO: Create a component like <For> and <Index> but for Tree structures
// that would allow rendering tree nodes efficiently with proper reactivity
// and minimal re-renders when nodes are added/removed/moved.

// ------------- Path utilities -------------
/**
 * Compare two paths for strict equality.
 * @example
 * ```ts
 * isSamePath([0,1],[0,1]) // true
 * isSamePath([0,1],[1,0]) // false
 * ```
 */
export function isSamePath(a: Path, b: Path): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Returns true if `ancestor` is a strict ancestor of `candidate`.
 * @example
 * ```ts
 * isAncestorPath([0],[0,2,3]) // true
 * isAncestorPath([0,2],[0,2]) // false (not strict)
 * isAncestorPath([1],[0,2]) // false
 * ```
 */
export function isAncestorPath(ancestor: Path, candidate: Path): boolean {
  if (ancestor.length >= candidate.length) {
    return false;
  }
  for (let i = 0; i < ancestor.length; i++) {
    if (ancestor[i] !== candidate[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Lexicographically compare two paths.
 * -1 if a<b, 0 if equal, 1 if a>b.
 * @example
 * ```ts
 * comparePaths([0,1],[0,2]) // -1
 * comparePaths([1],[0,9]) // 1
 * comparePaths([0,1],[0,1]) // 0
 * ```
 */
export function comparePaths(a: Path, b: Path): -1 | 0 | 1 {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] < b[i]) {
      return -1;
    }
    if (a[i] > b[i]) {
      return 1;
    }
  }
  if (a.length < b.length) {
    return -1;
  }
  if (a.length > b.length) {
    return 1;
  }
  return 0;
}

/**
 * Returns the parent path, removing the last segment.
 * @example
 * ```ts
 * parentPath([0,2,3]) // [0,2]
 * parentPath([]) // [] (root has no parent)
 * ```
 */
export function parentPath(path: Path): Path {
  return path.slice(0, -1);
}

/**
 * Returns a sibling path offset from the given path.
 * @example
 * ```ts
 * siblingPath([0,2], +1) // [0,3]
 * siblingPath([0,2], -1) // [0,1]
 * ```
 */
export function siblingPath(path: Path = [], offset: number): Path {
  if (path.length === 0) return path;
  const p = path.slice();
  p[p.length - 1] += offset;
  return p;
}

/**
 * Get the child path for a given parent path and child index.
 * @param path The parent path.
 * @param childIndex The index of the child.
 * @returns The child path.
 */
export function childPath(path: Path = [], childIndex: number): Path {
  return [...path, childIndex];
}

// ------------- Access helpers -------------
/**
 * Resolve and return the node at `path`. Returns undefined if any step is missing.
 * @example
 * ```ts
 * const tree = { children: [ { name: 'A' }, { children: [ { name: 'B' } ] } ] };
 * getNodeAtPath(tree, [1,0])?.name // 'B'
 * ```
 */
export function getNodeAtPath<T>(root: AnyTreeView<'children', T>, path: Path): AnyTreeView<'children', T> | undefined {
  let cur: AnyTreeView<'children', T> | undefined = root;
  for (let i = 0; i < path.length; i++) {
    const idx = path[i];
    const arr: AnyTreeView<'children', T>[] | undefined = cur?.children;
    if (!arr || idx < 0 || idx >= arr.length) {
      return undefined;
    }
    cur = arr[idx];
  }
  return cur;
}

/**
 * Resolve and return the parent node for `path` and the child index at that parent.
 * Undefined if the parent doesn’t exist.
 * @example
 * ```ts
 * getParentAtPath(tree, [2,1]) // => { parent: tree.children[2], index: 1 }
 * ```
 */
export function getParentAtPath<T>(
  root: AnyTreeView<'children', T>,
  path: Path
): { parent: AnyTreeView<'children', T>; index: number } | undefined {
  if (path.length === 0) {
    return undefined;
  }
  let parent: AnyTreeView<'children', T> = root;
  for (let i = 0; i < path.length - 1; i++) {
    const idx = path[i];
    const arr = parent.children;
    if (!arr || idx < 0 || idx >= arr.length) {
      return undefined;
    }
    parent = arr[idx];
  }
  return { parent, index: path[path.length - 1] } as const;
}

/**
 * Check if a path exists in the tree.
 * @example
 * ```ts
 * hasPath(tree, [0,2]) // true or false
 * ```
 */
export function hasPath<T>(root: AnyTreeView<'children', T>, path: Path): boolean {
  return getNodeAtPath(root, path) !== undefined;
}

/**
 * List children of the node at `path` (or root when omitted).
 * @example
 * ```ts
 * listChildren(tree, [0]) // -> tree.children[0]?.children
 * ```
 */
export function listChildren<T>(
  root: AnyTreeView<'children', T>,
  path: Path = []
): AnyTreeView<'children', T>[] | undefined {
  const node = path.length ? getNodeAtPath(root, path) : root;
  return node?.children;
}

// Ensure all intermediate parents exist; creates empty nodes where missing
/**
 * Ensure all intermediate parents for `path` exist, creating empty nodes as needed.
 * Returns the parent node for the final segment and that segment index.
 * @example
 * ```ts
 * ensurePath(tree, [0,2,1]) // creates missing nodes along the way
 * ```
 */
export function ensurePath<T>(
  root: AnyTreeView<'children', T>,
  path: Path
): { parent: AnyTreeView<'children', T>; index: number } {
  let cur = root as AnyTreeView<'children', T>;
  for (let i = 0; i < path.length - 1; i++) {
    const idx = path[i];
    if (!cur.children) {
      cur.children = [] as AnyTreeView<'children', T>[];
    }
    if (!cur.children[idx]) {
      cur.children[idx] = {} as AnyTreeView<'children', T>;
    }
    cur = cur.children[idx];
  }
  return { parent: cur, index: path[path.length - 1] } as const;
}

// Clamp each step to the available children length; best-effort normalization
/**
 * Clamp each segment of `path` to the available children length while traversing.
 * Useful for correcting out-of-bounds indices after edits.
 * @example
 * ```ts
 * clampPath(tree, [0, 99]) // -> [0, lastIndex]
 * ```
 */
export function clampPath<T>(root: AnyTreeView<'children', T>, path: Path): Path {
  const out: number[] = [];
  let cur: AnyTreeView<'children', T> = root;
  for (let i = 0; i < path.length; i++) {
    const arr = cur.children ?? [];
    const max = arr.length;
    let idx = path[i];
    if (max === 0) {
      idx = 0;
    } else {
      idx = Math.max(0, Math.min(idx, max - 1));
    }
    out.push(idx);
    if (!arr[idx]) {
      break; // can't go deeper
    }
    cur = arr[idx];
  }
  return out;
}

export const normalizePath = clampPath;

// ------------- Mutations -------------
/**
 * Insert or replace a node at an exact `path`.
 * When `autoCreateParents` is true (default), missing parents are created.
 * @example
 * ```ts
 * insertAtPath(tree, [1,0], { title: 'X' })
 * ```
 */
export function insertAtPath<T>(
  root: AnyTreeView<'children', T>,
  path: Path,
  node: AnyTreeView<'children', T>,
  options?: { autoCreateParents?: boolean }
): void {
  const auto = options?.autoCreateParents ?? true;
  const info = auto ? ensurePath(root, path) : getParentAtPath(root, path);
  if (!info) {
    return;
  }
  const { parent, index } = info;
  if (!parent.children) {
    parent.children = [] as AnyTreeView<'children', T>[];
  }
  parent.children[index] = node;
}

/**
 * Append a child to the end of `parentPath` and return its index.
 * @example
 * ```ts
 * const idx = appendChild(tree, [0], { title: 'Child' })
 * ```
 */
export function appendChild<T>(
  root: AnyTreeView<'children', T>,
  parentPath: Path,
  node: AnyTreeView<'children', T>
): number | undefined {
  const info = ensurePath(root, parentPath);
  if (!info.parent.children) {
    info.parent.children = [] as AnyTreeView<'children', T>[];
  }
  info.parent.children.push(node);
  return info.parent.children.length - 1;
}

/**
 * Replace the node at `path` and return true if successful.
 * @example
 * ```ts
 * replaceAtPath(tree, [2], { title: 'New' })
 * ```
 */
export function replaceAtPath<T>(
  root: AnyTreeView<'children', T>,
  path: Path,
  node: AnyTreeView<'children', T>
): boolean {
  const info = getParentAtPath(root, path);
  if (!info) {
    return false;
  }
  const { parent, index } = info;
  if (!parent.children || index < 0 || index >= parent.children.length) {
    return false;
  }
  parent.children[index] = node;
  return true;
}

/**
 * Remove and return the node at `path`, or undefined if not found.
 * @example
 * ```ts
 * const removed = removeAtPath(tree, [1,3])
 * ```
 */
export function removeAtPath<T>(root: AnyTreeView<'children', T>, path: Path): AnyTreeView<'children', T> | undefined {
  const info = getParentAtPath(root, path);
  if (!info || !info.parent.children) {
    return undefined;
  }
  const { parent, index } = info;

  if (!parent.children) {
    return undefined;
  }

  if (index < 0 || index >= parent.children.length) {
    return undefined;
  }
  const [removed] = parent.children.splice(index, 1);
  return removed;
}

/**
 * Reorder two indices under the same `parentPath`.
 * @example
 * ```ts
 * reorder(tree, [0], 1, 3) // move child 1 to position 3
 * ```
 */
export function reorder<T>(
  root: AnyTreeView<'children', T>,
  parentPath: Path,
  fromIndex: number,
  toIndex: number
): void {
  const node = getNodeAtPath(root, parentPath);
  if (!node || !node.children || fromIndex < 0 || fromIndex >= node.children.length) {
    return;
  }
  let target = Math.max(0, Math.min(toIndex, node.children.length - 1));
  const [item] = node.children.splice(fromIndex, 1);
  if (target > fromIndex) {
    target -= 1; // adjust after removal
  }
  node.children.splice(target, 0, item);
}

/**
 * Move a node from `from` to `to`.
 * Prevents moving a node into its own descendant and adjusts same-parent indices.
 * @example
 * ```ts
 * moveNode(tree, [0,1], [2,0])
 * ```
 */
export function moveNode<T>(root: AnyTreeView<'children', T>, from: Path, to: Path): void {
  if (from.length === 0) {
    return; // don't move the root
  }
  if (isAncestorPath(from, to)) {
    return; // avoid cycles
  }
  const fromInfo = getParentAtPath(root, from);
  const toInfo = getParentAtPath(root, to);
  if (!fromInfo || !toInfo || !fromInfo.parent.children) {
    return;
  }
  const { parent: fromParent, index: fromIdx } = fromInfo;
  const { parent: toParent } = toInfo;
  if (!fromParent.children || fromIdx < 0 || fromIdx >= fromParent.children.length) {
    return;
  }
  const [node] = fromParent.children.splice(fromIdx, 1);
  let targetIdx = to[to.length - 1];
  if (toParent === fromParent && targetIdx > fromIdx) {
    targetIdx -= 1;
  }
  if (!toParent.children) {
    toParent.children = [] as AnyTreeView<'children', T>[];
  }
  targetIdx = Math.max(0, Math.min(targetIdx, toParent.children.length));
  toParent.children.splice(targetIdx, 0, node);
}

/**
 * Move `from` node to be before `targetPath` under the same parent.
 * @example
 * ```ts
 * moveBefore(tree, [1], [3]) // move child at 1 to position 3 (before old 3)
 * ```
 */
export function moveBefore<T>(root: AnyTreeView<'children', T>, from: Path, targetPath: Path): void {
  const info = getParentAtPath(root, targetPath);
  if (!info) {
    return;
  }
  moveNode(root, from, [...parentPath(targetPath), info.index]);
}

/**
 * Move `from` node to be after `targetPath` under the same parent.
 * @example
 * ```ts
 * moveAfter(tree, [1], [3]) // move child at 1 to after position 3
 * ```
 */
export function moveAfter<T>(root: AnyTreeView<'children', T>, from: Path, targetPath: Path): void {
  const info = getParentAtPath(root, targetPath);
  if (!info) {
    return;
  }
  moveNode(root, from, [...parentPath(targetPath), info.index + 1]);
}

/**
 * Move `from` node as a child of `parent` at optional `index`.
 * Defaults to appending to the end.
 * @example
 * ```ts
 * moveAsChild(tree, [0], [2]) // append under [2]
 * moveAsChild(tree, [0], [2], 1) // insert at index 1 under [2]
 * ```
 */
export function moveAsChild<T>(root: AnyTreeView<'children', T>, from: Path, parent: Path, index?: number): void {
  const parentNode = getNodeAtPath(root, parent);
  if (!parentNode) {
    return;
  }
  const i = index ?? (parentNode.children ? parentNode.children.length : 0);
  moveNode(root, from, [...parent, i]);
}

// ------------- Traversal / transform -------------
/**
 * Depth-first traversal calling `visitor` on each node with its path.
 * @example
 * ```ts
 * walkDFS(tree, (node, path) => console.log(path, node))
 * ```
 */
export function walkDFS<T>(
  root: AnyTreeView<'children', T>,
  visitor: (node: AnyTreeView<'children', T>, path: Path) => void
): void {
  const visit = (node: AnyTreeView<'children', T>, path: Path) => {
    visitor(node, path);
    const arr = node.children;
    if (!arr) {
      return;
    }
    for (let i = 0; i < arr.length; i++) {
      visit(arr[i], [...path, i]);
    }
  };
  visit(root, []);
}

/**
 * Breadth-first traversal calling `visitor` on each node with its path.
 * @example
 * ```ts
 * walkBFS(tree, (node, path) => console.log(path, node))
 * ```
 */
export function walkBFS<T>(
  root: AnyTreeView<'children', T>,
  visitor: (node: AnyTreeView<'children', T>, path: Path) => void
): void {
  const queue: Array<{ node: AnyTreeView<'children', T>; path: Path }> = [{ node: root, path: [] }];
  while (queue.length) {
    const { node, path } = queue.shift()!;
    visitor(node, path);
    const arr = node.children;
    if (arr) {
      for (let i = 0; i < arr.length; i++) {
        queue.push({ node: arr[i], path: [...path, i] });
      }
    }
  }
}

/**
 * Flatten the tree into an array of { path, node } in DFS order.
 * @example
 * ```ts
 * const rows = flatten(tree)
 * ```
 */
export function flatten<T>(root: AnyTreeView<'children', T>): Array<{ path: Path; node: AnyTreeView<'children', T> }> {
  const out: Array<{ path: Path; node: AnyTreeView<'children', T> }> = [];
  walkDFS(root, (node, path) => out.push({ node, path }));
  return out;
}

/**
 * Create a new tree by mapping each node with `mapper`.
 * Children are mapped recursively and rebuilt.
 * @example
 * ```ts
 * const newTree = mapTree(tree, (node) => ({ ...node, tagged: true }))
 * ```
 */
export function mapTree<T>(
  root: AnyTreeView<'children', T>,
  mapper: (node: AnyTreeView<'children', T>, path: Path) => AnyTreeView<'children', T>
): AnyTreeView<'children', T> {
  const transform = (node: AnyTreeView<'children', T>, path: Path): AnyTreeView<'children', T> => {
    const mapped = mapper(node, path) || ({} as AnyTreeView<'children', T>);
    const src = node.children;
    if (src && src.length) {
      mapped.children = src.map((c, i) => transform(c, [...path, i]));
    }
    return mapped;
  };
  return transform(root, []);
}

/**
 * Create a pruned copy of a tree that keeps only nodes whose predicate returns true.
 * Parents are kept if they or any of their descendants match.
 * @example
 * ```ts
 * const filtered = filterTree(tree, (n) => n.title?.includes('foo'))
 * ```
 */
export function filterTree<T>(
  root: AnyTreeView<'children', T>,
  predicate: (node: AnyTreeView<'children', T>, path: Path) => boolean
): AnyTreeView<'children', T> | undefined {
  const filterRec = (node: AnyTreeView<'children', T>, path: Path): AnyTreeView<'children', T> | undefined => {
    if (!predicate(node, path)) return undefined;
    const res: AnyTreeView<'children', T> = { ...node };
    const arr = node.children;
    if (arr) {
      const children: AnyTreeView<'children', T>[] = [];
      for (let i = 0; i < arr.length; i++) {
        const child = filterRec(arr[i], [...path, i]);
        if (child) {
          children.push(child);
        }
      }
      if (children.length) {
        res.children = children;
      } else {
        delete res.children;
      }
    }
    return res;
  };
  return filterRec(root, []);
}

// ------------- Sanitize / validate -------------
/**
 * Remove falsy entries from children arrays recursively (compacts sparse arrays).
 * @example
 * ```ts
 * compactChildren(tree)
 * ```
 */
export function compactChildren<T>(root: AnyTreeView<'children', T>): void {
  walkDFS(root, (node) => {
    if (node.children) {
      node.children = node.children.filter(Boolean);
    }
  });
}

/**
 * Assign default values to nodes in-place using `assigner`.
 * @example
 * ```ts
 * assignDefaults(tree, (n) => { if (!(n as any).type) (n as any).type = 'default' })
 * ```
 */
export function assignDefaults<T>(
  root: AnyTreeView<'children', T>,
  assigner: (node: AnyTreeView<'children', T>) => void
): void {
  walkDFS(root, (node) => assigner(node));
}

/**
 * Validate all nodes with `validator`. Returns true only if all nodes pass.
 * @example
 * ```ts
 * const ok = validateTree(tree, (n) => typeof (n as any).title === 'string')
 * ```
 */
export function validateTree<T>(
  root: AnyTreeView<'children', T>,
  validator: (node: AnyTreeView<'children', T>) => boolean
): boolean {
  let ok = true;
  walkDFS(root, (node) => {
    if (!validator(node)) ok = false;
  });
  return ok;
}

// ------------- Structural helpers -------------
/**
 * Deep-clone the subtree at `path` using structuredClone.
 * @example
 * ```ts
 * const copy = cloneSubtree(tree, [0,1])
 * ```
 */
export function cloneSubtree<T>(root: AnyTreeView<'children', T>, path: Path): AnyTreeView<'children', T> | undefined {
  const node = getNodeAtPath(root, path);
  if (!node) {
    return undefined;
  }
  // naive deep clone; replace if nodes contain functions/non-serializables
  return structuredClone(node);
}

// A very simple merge: shallow-merge node fields; merge children index-wise
/**
 * Merge `patch` into `base`. Shallow-merge per node and merge children index-wise.
 * @example
 * ```ts
 * const merged = mergeTrees(base, patch)
 * ```
 */
export function mergeTrees<T>(
  base: AnyTreeView<'children', T>,
  patch: AnyTreeView<'children', T>
): AnyTreeView<'children', T> {
  const mergeRec = (a: AnyTreeView<'children', T>, b: AnyTreeView<'children', T>): AnyTreeView<'children', T> => {
    const out: AnyTreeView<'children', T> = { ...a, ...b };
    const ac = a.children ?? [];
    const bc = b.children ?? [];
    if (ac.length || bc.length) {
      const max = Math.max(ac.length, bc.length);
      out.children = [] as AnyTreeView<'children', T>[];
      for (let i = 0; i < max; i++) {
        const av = ac[i];
        const bv = bc[i];
        if (av && bv) {
          out.children[i] = mergeRec(av, bv);
        } else {
          out.children[i] = (bv ?? av) as AnyTreeView<'children', T>;
        }
      }
    }
    return out;
  };
  return mergeRec(base, patch);
}

// ------------- Diff / patch -------------
export type TreeOp<T> =
  | { op: 'insert'; path: Path; node: AnyTreeView<'children', T> }
  | { op: 'remove'; path: Path }
  | { op: 'replace'; path: Path; node: AnyTreeView<'children', T> };

/**
 * Produce a list of operations to transform tree `a` into tree `b`.
 * Comparison ignores the `children` field when deciding replace.
 * @example
 * ```ts
 * const ops = diffTrees(a, b)
 * ```
 */
export function diffTrees<T>(a: AnyTreeView<'children', T>, b: AnyTreeView<'children', T>): TreeOp<T>[] {
  const ops: TreeOp<T>[] = [];
  const withoutChildren = (obj: AnyTreeView<'children', T>): Record<string, unknown> => {
    const rec = obj as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(rec)) if (k !== 'children') out[k] = rec[k];
    return out;
  };
  const diffRec = (
    na: AnyTreeView<'children', T> | undefined,
    nb: AnyTreeView<'children', T> | undefined,
    path: Path
  ) => {
    if (!na && nb) {
      ops.push({ op: 'insert', path, node: nb });
      return;
    }
    if (na && !nb) {
      ops.push({ op: 'remove', path });
      return;
    }
    if (!na || !nb) {
      return;
    }
    // Shallow-ish compare excluding children by JSON stringifying non-children props
    if (JSON.stringify(withoutChildren(na)) !== JSON.stringify(withoutChildren(nb))) {
      ops.push({ op: 'replace', path, node: nb });
    }
    const ac = na.children ?? [];
    const bc = nb.children ?? [];
    const max = Math.max(ac.length, bc.length);
    for (let i = 0; i < max; i++) {
      diffRec(ac[i], bc[i], [...path, i]);
    }
  };
  diffRec(a, b, []);
  return ops;
}

/**
 * Apply a sequence of tree operations in-place to `root`.
 * @example
 * ```ts
 * applyPatch(tree, diffTrees(a, b))
 * ```
 */
export function applyPatch<T>(root: AnyTreeView<'children', T>, ops: TreeOp<T>[]): AnyTreeView<'children', T> {
  for (const op of ops) {
    switch (op.op) {
      case 'insert':
        insertAtPath(root, op.path, op.node, { autoCreateParents: true });
        break;
      case 'remove':
        removeAtPath(root, op.path);
        break;
      case 'replace':
        replaceAtPath(root, op.path, op.node);
        break;
    }
  }
  return root;
}

// ------------- Indexing by ID -------------
/**
 * Build a Map from node IDs to their paths.
 * @example
 * ```ts
 * const index = buildIndex(tree, (n) => (n as any).id)
 * ```
 */
export function buildIndex<T, Id>(
  root: AnyTreeView<'children', T>,
  getId: (node: AnyTreeView<'children', T>) => Id | undefined
): Map<Id, Path> {
  const map = new Map<Id, Path>();
  walkDFS(root, (node, path) => {
    const id = getId(node);
    if (id !== undefined) {
      map.set(id, path);
    }
  });
  return map;
}

/**
 * Lookup a path by ID from an index built with buildIndex.
 * @example
 * ```ts
 * getPathById(index, someId)
 * ```
 */
export function getPathById<Id>(index: Map<Id, Path>, id: Id): Path | undefined {
  return index.get(id);
}

/**
 * Check that IDs are unique across the tree.
 * Returns duplicates with all their paths when found.
 * @example
 * ```ts
 * const { unique, duplicates } = ensureIdUniqueness(tree, (n) => (n as any).id)
 * ```
 */
export function ensureIdUniqueness<T, Id>(
  root: AnyTreeView<'children', T>,
  getId: (node: AnyTreeView<'children', T>) => Id | undefined
): { unique: boolean; duplicates: Array<{ id: Id; paths: Path[] }> } {
  const bucket = new Map<Id, Path[]>();
  walkDFS(root, (node, path) => {
    const id = getId(node);
    if (id !== undefined) {
      const arr = bucket.get(id) ?? [];
      arr.push(path);
      bucket.set(id, arr);
    }
  });
  const duplicates: Array<{ id: Id; paths: Path[] }> = [];
  for (const [id, paths] of bucket.entries()) {
    if (paths.length > 1) {
      duplicates.push({ id, paths });
    }
  }
  return { unique: duplicates.length === 0, duplicates };
}
