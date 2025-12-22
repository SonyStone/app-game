import { createComponent, JSX } from 'solid-js';

/**
 * Higher-order function that wraps a component with multiple providers.
 *
 * Providers are applied from left to right in the arguments, resulting in a component tree
 * where the first provider is the outermost and the last provider is the innermost.
 *
 * @template P - The props type for the wrapped component
 * @param providers - Provider components that accept children. Each provider should be a function
 *                    component that takes `{ children: JSX.Element }` as props.
 * @returns A function that takes a component and returns a wrapped version
 *
 * @example
 * // Given these providers:
 * const ThemeProvider = (props: { children: JSX.Element }) => { ... };
 * const AuthProvider = (props: { children: JSX.Element }) => { ... };
 *
 * // And a component:
 * const MyApp = () => <div>Hello</div>;
 *
 * // Wrap it with providers:
 * export default withProviders(ThemeProvider, AuthProvider)(MyApp);
 *
 * // This creates the following component tree:
 * // <ThemeProvider>
 * //   <AuthProvider>
 * //     <MyApp />
 * //   </AuthProvider>
 * // </ThemeProvider>
 *
 * @example
 * // With props:
 * const MyComponent = (props: { name: string }) => <div>Hello {props.name}</div>;
 * export default withProviders(ThemeProvider, AuthProvider)(MyComponent);
 * // Usage: <MyComponent name="World" />
 *
 * @remarks
 * The function uses recursion with lazy evaluation (via getters) to ensure providers
 * are created in the correct order during SolidJS's rendering phase. Each provider
 * is only instantiated when its parent provider accesses the `children` prop.
 */
export const withProviders =
  (...providers: Array<(props: { children: JSX.Element }) => JSX.Element>) =>
  <P extends object>(Component: (props: P) => JSX.Element) =>
  (props: P) => {
    // Build the tree from outermost to innermost
    const buildTree = (index: number): JSX.Element => {
      if (index >= providers.length) {
        // Base case: we've gone through all providers, create the component
        return createComponent(Component, props);
      }

      // Recursive case: create current provider with remaining tree as children
      const Provider = providers[index];
      return createComponent(Provider, {
        get children() {
          return buildTree(index + 1);
        }
      });
    };

    return buildTree(0);
  };

export const withWrapper =
  (WrapperComponent: (props: { children: JSX.Element }) => JSX.Element) =>
  <P extends object>(Component: (props: P) => JSX.Element) => {
    return (props: P) => (
      <WrapperComponent>
        <Component {...props} />
      </WrapperComponent>
    );
  };
