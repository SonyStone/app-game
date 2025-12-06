import { noop, trueFn } from '@solid-primitives/utils';
import { batch, createRoot, createSignal, getOwner, onCleanup, Setter, Signal, type Accessor } from 'solid-js';

/**
 * Callback function for {@link createRootMapPool}. Called when a new root is created.
 * @param arg An accessor that returns the argument passed to {@link RootPoolFunction}.
 * @param active An accessor that returns the active state of the root.
 * When `false`, root is not being used and is waiting in the pool to be reused.
 * @param dispose A function that disposes the root and prevents it from being reused.
 * @returns The result of {@link RootPoolFunction}.
 */
export type RootPoolFactory<TKey, TArg, TResult> = (
  key: TKey,
  arg: Accessor<TArg>,
  active: Accessor<boolean>,
  dispose: VoidFunction
) => TResult;

/**
 * A function returned by {@link createRootMapPool}.
 * @param arg The argument passed to {@link RootPoolFactory}.
 */
export type RootPoolFunction<TKey, TArg, TResult> = (
  key: TKey,
  ..._: void extends TArg ? [arg?: TArg] : [arg: TArg]
) => TResult;

export function createRootMapPool<TKey, TArg, TResult>(
  factory: RootPoolFactory<TKey, TArg, TResult>
): RootPoolFunction<TKey, TArg, TResult>;
export function createRootMapPool<TKey, TArg, TResult>(
  factory: RootPoolFactory<TKey, TArg, TResult>
): (key: TKey, arg: TArg) => TResult {
  type Root = {
    v: TResult;
    key: TKey;
    set: Setter<TArg>;
    dispose(): void;
    setA(value: boolean): boolean;
    active: Accessor<boolean>;
  };

  const pool = new Map<TKey, Root>();
  // const elementHolder = new DocumentFragment();

  const owner = getOwner();

  const mapRootWithArgs = (key: TKey, dispose: VoidFunction, [args, set]: Signal<TArg>) => {
    const [active, setA] = createSignal(true);
    const v = factory(key, args, active, () => disposeRoot(key, root));
    // if (v instanceof Node) {
    //   elementHolder.appendChild(v);
    // }
    const root: Root = {
      dispose,
      set,
      setA,
      active,
      key,
      v
    };
    return root;
  };
  const mapRootNoArgs = (key: TKey, dispose: VoidFunction, [args, set]: Signal<TArg>) => {
    const v = factory(key, args, trueFn, noop);
    // if (v instanceof Node) {
    //   elementHolder.appendChild(v.cloneNode(true));
    // }
    return {
      dispose,
      set,
      setA: trueFn,
      active: trueFn,
      key,
      v
    } as Root;
  };

  const mapRoot = factory.length > 1 ? mapRootWithArgs : mapRootNoArgs;

  const disposeRoot = (key: TKey, root: Root) => {
    root.dispose();
    root.dispose = noop;
    if (root.active()) {
      root.setA(false);
    } else {
      pool.delete(key);
    }
  };

  const cleanupRoot = (root: Root) => {
    if (root.dispose !== noop) {
      pool.set(root.key, root);
      // if (root.v instanceof Node) {
      //   elementHolder.appendChild(root.v.cloneNode(true));
      // }
      root.setA(false);
    }
  };

  onCleanup(() => {
    for (const root of pool.values()) {
      root.dispose();
    }
  });

  return (key, arg) => {
    let root: Root | undefined;
    root = pool.get(key);

    if (root) {
      pool.delete(key);
      batch(() => {
        root!.set(() => arg);
        root!.setA(true);
      });
    } else {
      root = createRoot((dispose) => mapRoot(key, dispose, createSignal(arg)), owner);
    }

    onCleanup(() => cleanupRoot(root));

    return root.v;
  };
}
