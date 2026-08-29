import { ReactiveMap } from '@solid-primitives/map';
import { createMemo, For, onCleanup, storePath, StoreSetter, untrack } from 'solid-js';
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
        rootProps.setState(dynamicStorePath([...untrack(path), update]));
      },
      updateParent: (update) => {
        rootProps.setState(dynamicStorePath([...props.path, CHILDREN_KEY, update]));
      },
      remove: () => {
        rootProps.setState(
          dynamicStorePath([
            ...props.path,
            CHILDREN_KEY,
            (children: SVGNode[]) => {
              children.splice(props.key as number, 1);
            }
          ])
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

function dynamicStorePath(parts: readonly unknown[]): (state: SVGNode) => SVGNode | void {
  return (storePath as unknown as (...path: readonly unknown[]) => (state: SVGNode) => SVGNode | void)(...parts);
}
