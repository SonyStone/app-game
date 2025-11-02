import { Accessor, createMemo, createRoot, createSignal, JSX, JSXElement, onCleanup } from 'solid-js';

// Simple Tree component
export function Tree<TElement extends JSX.Element>(props: {
  root?: TreeNode;
  children: (props: { node: Readonly<TreeNode>; children: JSXElement }) => TElement;
}) {
  return createMemo(
    createTreeMapper(
      () => props.root,
      (itemProps) => {
        return props.children(itemProps) as unknown as HTMLElement;
      }
    )
  ) as unknown as JSX.Element;
}

type NodeId = string | number;

type TreeNode = Readonly<{
  id: NodeId;
  children?: ReadonlyArray<TreeNode>;
}>;

export function createTreeMapper<T extends TreeNode>(
  tree: Accessor<T | undefined | null>,
  mapFn: (props: { node: Readonly<T>; children: JSXElement; depth: number }) => HTMLElement
): Accessor<HTMLElement | undefined> {
  // Cache for node ID -> DOM element and reactive scope
  const cache = new Map<
    NodeId,
    {
      element: HTMLElement;
      childContainer: HTMLElement;
      setNode: (node: T) => void;
      setDepth: (depth: number) => void;
      dispose: () => void;
    }
  >();

  onCleanup(() => {
    cache.forEach((entry) => entry.dispose());
    cache.clear();
  });

  // Reconcile function to update DOM based on tree structure
  function reconcile(node: T, depth: number): HTMLElement {
    const id = node.id;

    let cached = cache.get(id);
    // Create new element if not in cache
    if (!cached) {
      console.log(`[CREATE] New element for ${id}`);

      createRoot((dispose) => {
        // Create a slot element that acts as a transparent container
        const anchor = document.createElement('div');
        anchor.style.display = 'contents'; // Makes the element not generate a box in layout

        // Create signals for reactive node and depth
        const [getNode, setNode] = createSignal(node);
        const [getDepth, setDepth] = createSignal(depth);

        const element = mapFn({
          get node() {
            return getNode() as Readonly<T>;
          },
          children: anchor as unknown as JSXElement,
          get depth() {
            return getDepth();
          }
        });

        cache.set(id, { element, childContainer: anchor, setNode, setDepth, dispose });
      });

      cached = cache.get(id)!;
    } else {
      // Update existing cached element with new node data
      cached.setNode(node);
      cached.setDepth(depth);
    }

    // Get the children container
    const childContainer = cached.childContainer;

    // Reconcile children
    if (childContainer && node.children) {
      const newChildren = node.children.map((child) => reconcile(child as T, depth + 1));

      // Update DOM children to match newChildren order
      newChildren.forEach((childEl, idx) => {
        const currentChild = childContainer.children[idx];
        if (currentChild !== childEl) {
          if (currentChild) {
            console.log(`[INSERT] Inserting at position ${idx}`);
            childContainer.insertBefore(childEl, currentChild);
          } else {
            console.log(`[APPEND] Appending at position ${idx}`);
            childContainer.appendChild(childEl);
          }
        }
      });

      // Remove extra children
      while (childContainer.children.length > newChildren.length) {
        console.log(`[REMOVE] Removing last child`);
        childContainer.removeChild(childContainer.lastChild!);
      }
    } else if (childContainer) {
      // No children - clear container
      while (childContainer.firstChild) {
        childContainer.removeChild(childContainer.firstChild);
      }
    }

    return cached.element;
  }

  return createMemo(() => {
    const root = tree();
    console.log('\n========== TREE UPDATE ==========');

    // If no root, clear cache and return undefined
    if (!root) {
      cache.forEach((entry) => entry.dispose());
      cache.clear();
      return undefined;
    }

    // Collect active IDs
    const activeIds = collectActiveIDs(
      root,
      (n) => n.children,
      (n) => n.id
    );

    // Remove stale entries
    cache.forEach((entry, id) => {
      if (!activeIds.has(id)) {
        console.log(`[DISPOSE] Removing ${id}`);
        entry.element.remove();
        entry.dispose();
        cache.delete(id);
      }
    });

    const result = reconcile(root, 0);
    console.log('Cache size:', cache.size);
    console.log('=================================\n');
    return result;
  });
}

/**
 * Collects the IDs of all active nodes in the tree.
 * Uses iterative depth-first traversal instead of recursion.
 * @param root The root node of the tree
 * @returns A set of active node IDs
 */
function collectActiveIDs<T>(
  root: Readonly<T> | ReadonlyArray<T>,
  getChildren: (node: Readonly<T>) => ReadonlyArray<T> | undefined,
  getId: (node: Readonly<T>) => NodeId
): Set<NodeId> {
  const activeIds = new Set<NodeId>();
  const stack: Readonly<T>[] = Array.isArray(root) ? [...root] : [root];

  while (stack.length > 0) {
    const node = stack.pop()!;
    const id = getId(node);
    const children = getChildren(node);

    activeIds.add(id);

    // Add children to stack in reverse order to maintain DFS left-to-right traversal
    if (children) {
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i] as T);
      }
    }
  }

  return activeIds;
}
