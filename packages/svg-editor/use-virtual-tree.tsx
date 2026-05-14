import { ReactiveMap } from '@solid-primitives/map';
import { createMemo, For, onCleanup, untrack } from 'solid-js';
import { produce, SetStoreFunction } from 'solid-js/store';
import { SVGNode } from './svg-node';

const CHILDREN_KEY = 'children';

export type Wrapped<T extends { [CHILDREN_KEY]?: T[] }> = {
  path: () => (string | number)[];
  remove: () => void;
  update: SetStoreFunction<SVGNode>;
  updateParent: SetStoreFunction<SVGNode>;
};

export function useVirtualTree(rootProps: { state: SVGNode; setState: SetStoreFunction<SVGNode> }) {
  const map = new ReactiveMap<SVGNode, Wrapped<SVGNode>>();

  function VirtualElement(props: { node: SVGNode; key?: string | number; path: (string | number)[] }) {
    const path = createMemo(() => {
      const key = props.key;
      return key !== undefined ? [...props.path, CHILDREN_KEY, key] : props.path;
    });

    map.set(props.node, {
      path: path,
      update: (...args: unknown[]) => {
        // @ts-expect-error A spread argument must either have a tuple type or be passed to a rest parameter.
        rootProps.setState(...untrack(path), ...args);
      },
      updateParent: (...args: unknown[]) => {
        rootProps.setState(
          // @ts-expect-error A spread argument must either have a tuple type or be passed to a rest parameter.
          ...props.path,
          CHILDREN_KEY,
          ...args
        );
      },
      remove: () => {
        rootProps.setState(
          // @ts-expect-error A spread argument must either have a tuple type or be passed to a rest parameter.
          ...props.path,
          CHILDREN_KEY,
          produce((children: SVGNode[]) => {
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
