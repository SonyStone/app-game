import { ReactiveMap } from '@solid-primitives/map';
import { createMemo, For, onCleanup, StoreSetter, untrack } from 'solid-js';
import { SVGNode } from './svg-node';

const CHILDREN_KEY = 'children';

export type Wrapped<T extends { [CHILDREN_KEY]?: T[] }> = {
  path: () => (string | number)[];
  remove: () => void;
  update: StoreSetter<SVGNode>;
  updateParent: (update: (children: SVGNode[]) => SVGNode[] | void) => void;
};

export function useVirtualTree(rootProps: { state: SVGNode; setState: StoreSetter<SVGNode> }) {
  const map = new ReactiveMap<SVGNode, Wrapped<SVGNode>>();

  function VirtualElement(props: { node: SVGNode; key?: string | number; path: (string | number)[] }) {
    const path = createMemo(() => {
      const key = props.key;
      return key !== undefined ? [...props.path, CHILDREN_KEY, key] : props.path;
    });

    map.set(props.node, {
      path: path,
      update: (update) => {
        rootProps.setState(updateAtPath(untrack(path), update));
      },
      updateParent: (update) => {
        rootProps.setState(updateAtPath([...props.path, CHILDREN_KEY], update));
      },
      remove: () => {
        rootProps.setState(
          updateAtPath([...props.path, CHILDREN_KEY], (children: SVGNode[]) => {
            children.splice(props.key as number, 1);
          })
        );
      }
    });

    onCleanup(() => {
      map.delete(props.node);
    });

    return (
      <For each={props.node[CHILDREN_KEY]}>
        {(child, index) => <VirtualElement node={child} key={index()} path={path()} />}
      </For>
    );
  }

  <VirtualElement node={rootProps.state} path={[]} />;

  return map;
}

/**
 * Creates a root store setter that applies `update` to the draft value at `path`.
 * Draft edits made by `update` apply in place; a different value it returns replaces the value at `path`.
 */
function updateAtPath<T>(
  path: readonly (string | number)[],
  update: (value: T) => T | void
): (root: SVGNode) => SVGNode | void {
  return (root) => {
    if (path.length === 0) {
      return update(root as unknown as T) as SVGNode | void;
    }

    const parent = path
      .slice(0, -1)
      .reduce<DraftRecord>((node, key) => node[key] as DraftRecord, root as unknown as DraftRecord);
    const key = path[path.length - 1];
    const value = parent[key] as T;
    const next = update(value);
    if (next !== undefined && next !== value) {
      parent[key] = next;
    }
  };
}

type DraftRecord = Record<string | number, unknown>;
