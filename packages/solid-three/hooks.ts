import { createMemo, onCleanup, useContext } from 'solid-js';
import * as THREE from 'three';
import { RenderCallback, RootState, ThreeContext } from './core/store';
import { buildGraph } from './core/utils';

export interface Loader<T> extends THREE.Loader {
  load(
    url: string,
    onLoad?: (result: T) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (event: ErrorEvent) => void
  ): unknown;
}

export type Extensions = (loader: THREE.Loader) => void;
export type LoaderResult<T> = T extends any[] ? Loader<T[number]> : Loader<T>;
export type ConditionalType<Child, Parent, Truthy, Falsy> = Child extends Parent ? Truthy : Falsy;
export type BranchingReturn<T, Parent, Coerced> = ConditionalType<T, Parent, Coerced, T>;

export function useStore() {
  const store = useContext(ThreeContext);
  if (!store) throw `R3F hooks can only be used within the Canvas component!`;
  return store;
}

export function useThree<T = RootState, U = T>(selector: (state: RootState) => U = (state) => state as unknown as U) {
  const [store] = useStore();
  return createMemo(() => selector(store));
}

/**
 * Creates a signal that is updated when the given effect is run.
 *
 * @example
 * ```ts
 * const [count, setCount] = useSignal(0);
 * useFrame(() => {
 *  setCount(count + 1);
 * });
 * ```
 *
 * @param callback - a function to run on every frame render
 * @param renderPriority -  priority of the callback decides its order in the frameloop, higher is earlier
 */
export function useFrame(callback: RenderCallback, renderPriority: number = 0): void {
  const [store] = useStore();
  const cleanup = store.internal.subscribe(callback, renderPriority);
  onCleanup(cleanup);
}

export function useGraph(object: THREE.Object3D) {
  return createMemo(() => buildGraph(object));
}

export function loadingFn<T>(extensions?: Extensions, onProgress?: (event: ProgressEvent<EventTarget>) => void) {
  return function (Proto: new () => LoaderResult<T>, ...input: string[]) {
    // Construct new loader and run extensions
    const loader = new Proto();
    if (extensions) extensions(loader);
    // Go through the urls and load them
    return Promise.all(
      input.map(
        (input) =>
          new Promise((res, reject) =>
            loader.load(
              input,
              (data) => {
                // Skip type checking for GLTF/3D model data structures
                if (data && typeof data === 'object' && 'scene' in data) {
                  Object.assign(data, buildGraph((data as { scene: THREE.Object3D }).scene));
                }
                res(data);
              },
              onProgress,
              (error) => reject(`Could not load ${input}: ${error.message}`)
            )
          )
      )
    );
  };
}

// export function useLoader<T, U extends string | string[]>(
//   Proto: new () => LoaderResult<T>,
//   input: U,
//   extensions?: Extensions,
//   onProgress?: (event: ProgressEvent<EventTarget>) => void
// ): U extends any[]
//   ? BranchingReturn<T, GLTF, GLTF & ObjectMap>[]
//   : BranchingReturn<T, GLTF, GLTF & ObjectMap> {
//   // Use suspense to load async assets
//   const keys = (Array.isArray(input) ? input : [input]) as string[];
//   const results = suspend(
//     loadingFn<T>(extensions, onProgress),
//     [Proto, ...keys],
//     { equal: is.equ }
//   );
//   // Return the object/s
//   return (Array.isArray(input) ? results : results[0]) as U extends any[]
//     ? BranchingReturn<T, GLTF, GLTF & ObjectMap>[]
//     : BranchingReturn<T, GLTF, GLTF & ObjectMap>;
// }

// useLoader.preload = function <T, U extends string | string[]>(
//   Proto: new () => LoaderResult<T>,
//   input: U,
//   extensions?: Extensions
// ) {
//   const keys = (Array.isArray(input) ? input : [input]) as string[];
//   return preload(loadingFn<T>(extensions), [Proto, ...keys]);
// };

// useLoader.clear = function <T, U extends string | string[]>(
//   Proto: new () => LoaderResult<T>,
//   input: U
// ) {
//   const keys = (Array.isArray(input) ? input : [input]) as string[];
//   return clear([Proto, ...keys]);
// };
