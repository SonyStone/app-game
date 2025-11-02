import type { Accessor, JSX } from 'solid-js';
import { mapArray } from 'solid-js';
import { Path } from '../TreeViewUtils';

/**
 * Function to extract children from a tree node
 */
export type GetChildren<T> = (item: T) => readonly T[] | undefined | null;

/**
 * Render function for tree items
 */
export type TreeRenderFn<T> = (props: {
  item: Accessor<T>;
  index: Accessor<number>;
  path: Accessor<Path>;
  renderChildren: () => JSX.Element;
}) => JSX.Element;

/**
 * Props for the Tree component
 */
export interface TreeProps<T, U> {
  /**
   * The array of tree items to render
   */
  each: readonly T[] | undefined | null | false;

  /**
   * Function to extract a unique key from each item for stable identity
   */
  by: (item: T, index: number) => U;

  /**
   * Function to get children from an item (return undefined/null if no children)
   */
  getChildren: GetChildren<T>;

  /**
   * Fallback content when there are no children
   */
  fallback?: JSX.Element;

  /**
   * Render function that receives the item accessor, index, and renderChildren callback
   */
  children: TreeRenderFn<T>;

  /**
   * The path to the current node in the tree
   */
  path?: Path;
}

/**
 * Tree component for rendering hierarchical data structures with stable node identity.
 *
 * Similar to `<For>` but recursively renders tree structures. Uses keyed rendering
 * to preserve component instances when items are reordered or moved between branches.
 *
 * @example
 * ```tsx
 * interface TreeNode {
 *   id: string;
 *   title: string;
 *   children?: TreeNode[];
 * }
 *
 * const [tree, setTree] = createStore<TreeNode[]>([...]);
 *
 * <Tree
 *   each={tree}
 *   by={(node) => node.id}
 *   getChildren={(node) => node.children}
 * >
 *   {(item, index, renderChildren) => (
 *     <li>
 *       <div>{item().title}</div>
 *       <ul>{renderChildren()}</ul>
 *     </li>
 *   )}
 * </Tree>
 * ```
 *
 * @example Moving nodes preserves component identity:
 * ```tsx
 * // When you move a node, its DOM isn't recreated
 * setTree(produce(tree => {
 *   moveNode(tree, [0, 2], [1, 0]); // component instances preserved
 * }));
 * ```
 */
export function Tree<T, U extends string | number>(props: TreeProps<T, U>): JSX.Element {
  const items = () => props.each || [];
  const path = () => props.path || [];

  const mapped = mapArray(items, (item, index) => {
    // Create a function that renders this item's children recursively

    const childPath = () => [...path(), index()];

    const renderChildren = (): JSX.Element => {
      const childItems = props.getChildren(item);
      if (!childItems || childItems.length === 0) {
        return props.fallback as JSX.Element;
      }

      return (
        <Tree
          each={childItems}
          by={props.by}
          getChildren={props.getChildren}
          path={childPath()}
          fallback={props.fallback}
          children={props.children}
        />
      ) as JSX.Element;
    };

    // Call the render function with reactive accessors
    return props.children({ item: () => item, index, renderChildren, path: childPath });
  });

  return mapped as unknown as JSX.Element;
}
