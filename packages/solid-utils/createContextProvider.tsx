import { Component, createContext, JSXElement, useContext } from 'solid-js';

/**
 * Create the context provider component & useContext function with types
 * inferred from the factory function.
 * @param factoryFn Factory function will run when the provider component in executed.
 * It takes the provider component `props` as it's argument, and what it returns will be
 * available in the contexts for all the underlying components.
 * @returns tuple of `[provider component, useContext function]`
 * @example
 * ```tsx
 * const [CounterProvider, useCounter] = createContextProvider((props: { initial: number }) => {
 *    const [count, setCount] = createSignal(props.initial);
 *    const increment = () => setCount(count() + 1)
 *    return { count, increment };
 * });
 * // Provide the context
 * <CounterProvider initial={1}>
 *    <App/>
 * </CounterProvider>
 * // get the context
 * const ctx = useCounter()
 * ctx?.count() // => 1
 * ```
 */
export default function createContextProvider<T, P>(
  factoryFn: (props: P) => T
): readonly [provider: Component<P & { children?: JSXElement }>, useContext: () => T];

export default function createContextProvider<T>(): readonly [
  provider: Component<{ children?: JSXElement; value: T }>,
  useContext: () => T
];

export default function createContextProvider<T, P>(
  factoryFn?: (props: P) => T
): readonly [provider: Component<P & { children?: JSXElement; value?: T }>, useContext: () => T] {
  const ctx = createContext<T>();

  function Provider(props: P & { children?: JSXElement; value?: T }) {
    return <ctx.Provider value={factoryFn ? factoryFn(props) : props.value}>{props.children}</ctx.Provider>;
  }

  function useProvider() {
    const app = useContext(ctx);
    // I don't like to throw new Error, but I don't know how to make it better.
    // Errors don't have a type, maybe I should just return `new Error`?
    // And I don't want to return `undefined` here either.
    if (!app) throw new Error('useProvider must be used within a Provider');
    return app;
  }

  return [Provider, useProvider] as const;
}
