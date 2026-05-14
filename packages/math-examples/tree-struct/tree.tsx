import { Accessor, createMemo, createRoot, createSignal, JSX, JSXElement, onCleanup } from 'solid-js';

type NodeId = string | number;

export type TreeNode = Readonly<{
  id: NodeId;
  children?: ReadonlyArray<TreeNode>;
}>;

// Simple Tree component
export function Tree(props: { root?: TreeNode; children: MapFn }) {
  return createTreeMapper(() => props.root, props.children);
}

type MapFn = (props: {
  node: Readonly<TreeNode>;
  children: JSXElement;
  depth: number;
  childCount: number;
  path: number[];
}) => JSX.Element;

export function createTreeMapper(tree: Accessor<TreeNode | undefined | null>, mapFn: MapFn): JSX.Element {
  type ReactiveScope = {
    element: JSX.Element;
    childContainer: HTMLElement;
    setNode: (node: TreeNode) => void;
    setDepth: (depth: number) => void;
    setChildCount: (count: number) => void;
    setPath: (path: number[]) => void;
    dispose: () => void;
  };

  // Cache for node ID -> DOM element and reactive scope
  const cache = new Map<NodeId, ReactiveScope>();

  onCleanup(() => {
    cache.forEach((entry) => entry.dispose());
    cache.clear();
  });

  return createMemo(() => {
    const root = tree();
    // console.log('\n========== TREE UPDATE ==========');

    // If no root, clear cache and return undefined
    if (!root) {
      cache.forEach((entry) => entry.dispose());
      cache.clear();
      return undefined;
    }

    // Collects the IDs of all active nodes in the tree.
    // Uses iterative depth-first traversal instead of recursion.
    // Collect active IDs
    const activeIds = new Set<NodeId>();
    {
      const stack: Readonly<TreeNode>[] = Array.isArray(root) ? [...root] : [root];

      while (stack.length > 0) {
        const node = stack.pop()!;
        const id = node.id;
        const children = node.children;

        activeIds.add(id);

        // Add children to stack in reverse order to maintain DFS left-to-right traversal
        if (children) {
          for (let i = children.length - 1; i >= 0; i--) {
            stack.push(children[i]);
          }
        }
      }
    }

    // Remove stale entries
    cache.forEach((entry, id) => {
      if (!activeIds.has(id)) {
        // console.log(`[DISPOSE] Removing ${id}`);
        (entry.element as unknown as HTMLElement)?.remove();
        entry.dispose();
        cache.delete(id);
      }
    });

    // Reconcile to update DOM based on tree structure (iterative version)

    // Map to store reconciled elements by node ID
    const reconciledElements = new Map<NodeId, JSX.Element>();
    {
      // Map to store total descendant counts for each node
      const childCounts = new Map<NodeId, number>();

      // Two-pass approach:
      // Pass 1: Create/update all node elements (bottom-up via post-order traversal)
      // Pass 2: Update DOM children in parent containers

      type StackEntry = Readonly<{
        node: TreeNode;
        depth: number;
        path: number[];
      }> & {
        visited: boolean;
      };

      // Stack for processing (we'll process in post-order for bottom-up)
      const stack: StackEntry[] = [{ node: root, depth: 0, path: [], visited: false }];

      // Post-order traversal to process children before parents
      while (stack.length > 0) {
        const entry = stack[stack.length - 1];

        if (entry.visited) {
          // Process this node (all children already processed)
          stack.pop();
          const { node, depth, path } = entry;
          const id = node.id;

          // Calculate total child count (direct children + all descendants)
          let totalChildCount = 0;
          if (node.children) {
            totalChildCount = node.children.length; // Direct children
            // Add all descendants
            for (const child of node.children) {
              const childDescendants = childCounts.get(child.id) || 0;
              totalChildCount += childDescendants;
            }
          }
          childCounts.set(id, totalChildCount);

          let cached = cache.get(id);

          // Create new element if not in cache
          if (!cached) {
            // console.log(`[CREATE] New element for ${id}`);
            createRoot((dispose) => {
              // Create a slot element that acts as a transparent container
              const anchor = document.createElement('div');
              anchor.style.display = 'contents';

              // Create signals for reactive node, depth, child count, and path
              const [getNode, setNode] = createSignal(node);
              const [getDepth, setDepth] = createSignal(depth);
              const [getChildCount, setChildCount] = createSignal(totalChildCount);
              const [getPath, setPath] = createSignal(path);

              const element = mapFn({
                get node() {
                  return getNode();
                },
                children: anchor,
                get depth() {
                  return getDepth();
                },
                get childCount() {
                  return getChildCount();
                },
                get path() {
                  return getPath();
                }
              });

              cache.set(id, {
                element,
                childContainer: anchor,
                setNode,
                setDepth,
                setChildCount,
                setPath,
                dispose: () => {
                  console.log('😄❗ Disposing node:', id);
                  dispose();
                }
              });
            });

            cached = cache.get(id)!;
          } else {
            // Update existing cached element with new node data
            cached.setNode(node);
            cached.setDepth(depth);
            cached.setChildCount(totalChildCount);
            cached.setPath(path);
          }

          // Get the children container
          const childContainer = cached.childContainer;

          // Reconcile children in this container
          if (childContainer && node.children) {
            // Collect reconciled child elements in order
            const newChildren: JSX.Element[] = [];
            for (const child of node.children) {
              const childElement = reconciledElements.get(child.id);
              if (childElement) {
                newChildren.push(childElement);
              }
            }

            // Update DOM children to match newChildren order
            newChildren.forEach((childEl, idx) => {
              const currentChild = childContainer.children[idx];
              if (currentChild !== childEl) {
                if (currentChild) {
                  // console.log(`[INSERT] Inserting at position ${idx}`);
                  childContainer.insertBefore(childEl as unknown as Node, currentChild);
                } else {
                  // console.log(`[APPEND] Appending at position ${idx}`);
                  childContainer.appendChild(childEl as unknown as Node);
                }
              }
            });

            // Remove extra children
            while (childContainer.children.length > newChildren.length) {
              // console.log(`[REMOVE] Removing last child`);
              childContainer.removeChild(childContainer.lastChild!);
            }
          } else if (childContainer) {
            // No children - clear container
            while (childContainer.firstChild) {
              childContainer.removeChild(childContainer.firstChild);
            }
          }

          // Store reconciled element
          reconciledElements.set(id, cached.element);
        } else {
          // Mark as visited and add children to stack (in reverse order for correct DFS)
          entry.visited = true;

          if (entry.node.children) {
            for (let i = entry.node.children.length - 1; i >= 0; i--) {
              stack.push({
                node: entry.node.children[i],
                depth: entry.depth + 1,
                path: [...entry.path, i], // Append current child index to path
                visited: false
              });
            }
          }
        }
      }
    }

    return reconciledElements.get(root.id)!;
    // console.log('Cache size:', cache.size);
    // console.log('=================================\n');
  }) as unknown as JSX.Element;
}
