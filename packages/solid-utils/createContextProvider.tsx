import { access, MaybeAccessor } from '@solid-primitives/utils';
import { Component, createComponent, createContext, JSX, JSXElement, useContext } from 'solid-js';

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
export function createContextProvider<T, TProps>(
  factoryFn: (props: TProps) => T,
  defaults?: MaybeAccessor<T>
): ContextProvider<T, TProps>;

export function createContextProvider<T>(): ContextProvider<T, { value: T }>;

export function createContextProvider<T, TProps>(
  factoryFn?: (props: TProps) => T,
  defaults?: MaybeAccessor<T>
): ContextProvider<T, TProps & { value?: T }> {
  const ctx = createContext(access(defaults));

  function Provider(props: TProps & { children?: JSXElement; value?: T }) {
    return createComponent(ctx.Provider, {
      value: factoryFn ? factoryFn(props) : props.value,
      get children() {
        return props.children;
      }
    });
  }

  function useProvider() {
    const app = useContext(ctx);
    // I don't like to throw new Error, but I don't know how to make it better.
    // Errors don't have a type, maybe I should just return `new Error`?
    // And I don't want to return `undefined` here either.
    if (!app) {
      if (defaults) {
        return access(defaults);
      }
      throw new Error('useProvider must be used within a Provider');
    }

    return app;
  }

  function ContextConsumer(props: { children: RequiredParameter<(item: T) => JSX.Element> }): JSX.Element {
    const app = useProvider();
    return props.children(app);
  }

  return [Provider, useProvider, ContextConsumer] as const;
}

/** @deprecated default export is deprecated */
export default createContextProvider;

type RequiredParameter<T> = T extends () => unknown ? never : T;

type ContextProvider<T, TProps = object> = readonly [
  Provider: Component<TProps & { children?: JSXElement }>,
  useContext: () => T,
  ContextConsumer: Component<{ children: RequiredParameter<(item: T) => JSX.Element> }>
];
