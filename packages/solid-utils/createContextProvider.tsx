import { access, MaybeAccessor } from '@solid-primitives/utils';
import { createComponent, createContext, DEV, JSX, JSXElement, useContext } from 'solid-js';

type Consumer<T> = (props: { children: (value: T) => JSX.Element | void }) => JSX.Element;

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

export function createContextProvider<TContext>(): readonly [
  provider: (props: { children?: JSXElement; value: TContext }) => JSX.Element,
  use: () => TContext,
  consumer: Consumer<TContext>
];

export function createContextProvider<TContext>(
  factoryFn: () => TContext,
  defaultValue?: MaybeAccessor<TContext>
): readonly [
  provider: (props: { children?: JSXElement }) => JSX.Element,
  use: () => TContext,
  consumer: Consumer<TContext>
];

export function createContextProvider<TContext>(
  factoryFn: (props: { value: TContext }) => TContext,
  defaultValue?: MaybeAccessor<TContext>
): readonly [
  provider: (props: { children?: JSXElement; value: TContext }) => JSX.Element,
  use: () => TContext,
  consumer: Consumer<TContext>
];

export function createContextProvider<TContext, TProps>(
  factoryFn: (props: TProps) => TContext,
  defaultValue?: MaybeAccessor<TContext>
): readonly [
  provider: (props: TProps & { children?: JSXElement }) => JSX.Element,
  use: () => TContext,
  consumer: Consumer<TContext>
];

export function createContextProvider<TContext, TProps>(
  factoryFn?: (props?: TProps) => TContext,
  defaultValue?: MaybeAccessor<TContext>
) {
  const ctx = createContext(access(defaultValue));

  const useProvider = () => {
    const app = useContext(ctx);
    // I don't like to throw new Error, but I don't know how to make it better.
    // Errors don't have a type, maybe I should just return `new Error`?
    // And I don't want to return `undefined` here either.
    if (!app) {
      if (defaultValue) {
        return access(defaultValue);
      }
      if (DEV) {
        // Most of the time, missing provider is a hot reload
        // and @refresh reload is not working
        // ! But with wrong implementation it can cause infinite reload loop
        // location.reload();
      }
      throw new Error('useProvider must be used within a Provider');
    }

    return app;
  };

  const Provider = (props: TProps & { value: TContext } & { children?: JSXElement }): JSX.Element => {
    return createComponent(ctx.Provider, {
      value: factoryFn ? factoryFn(props) : props.value,
      get children() {
        return props.children;
      }
    });
  };

  const ContextConsumer = (props: { children: (item: TContext) => JSX.Element | void }): JSX.Element => {
    const app = useProvider();
    return props.children(app) ?? null;
  };

  return [Provider, useProvider, ContextConsumer] as const;
}

/** @deprecated default export is deprecated */
export default createContextProvider;
