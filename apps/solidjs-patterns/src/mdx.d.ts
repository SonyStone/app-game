declare module '*.mdx' {
  import type { JSX } from 'solid-js';

  const Component: (props: { components?: Record<string, (props: any) => JSX.Element> }) => JSX.Element;

  export default Component;
}
