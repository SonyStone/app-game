# Pass Data (Markdown Component)

This page is plain markdown compiled into a component module. It preserves inline `code`, [links](https://mdxjs.com/packages/rollup/), lists, blockquotes, and fenced code blocks.

## Props preserve reactivity

When a parent passes `count={count()}` it reads immediately. When it passes `count={count}` it hands the child a getter, so the child decides where the subscription lives.

```tsx title="props-lowering.tsx"
import { JSX } from 'solid-js';
import { createComponent } from 'solid-js/web';

function Hand(props: { rotate: number; class?: string; length: number; width: number }) {
  return (
    <div
      class={props.class}
      style={{
        transform: `rotate(${props.rotate}deg)`,
        width: `${props.width}px`,
        height: `${props.length}px`
      }}
    />
  );
}

export function App(props: { subsecond: number }): JSX.Element {
  return <Hand rotate={props.subsecond} class="subsecond" length={85} width={5} />;
}

export function App2(props: { subsecond: number }): JSX.Element {
  return createComponent(Hand, {
    get rotate() {
      return props.subsecond;
    },
    class: 'subsecond',
    length: 85,
    width: 5
  });
}
```

> This mode is MDX-like for markdown semantics, but it still does not understand arbitrary embedded custom components.

## References

- [@mdx-js/rollup](https://mdxjs.com/packages/rollup/)
- [Injecting MDX components](https://mdxjs.com/guides/injecting-components/)
- [Solid props concept docs](https://docs.solidjs.com/concepts/components/props)

## Props preserve reactivity

MDX keeps the prose readable while still letting this page drop in real Solid components where markdown alone becomes too limiting.

When a parent passes `count={count()}` it reads immediately. When it passes `count={count}` it hands the child a getter, so the child decides where the subscription lives.

```tsx
import { JSX } from 'solid-js';
import { createComponent } from 'solid-js/web';

function Hand(props: { rotate: number; class?: string; length: number; width: number }) {
  return (
    <div
      class={props.class}
      style={{
        transform: `rotate(${props.rotate}deg)`,
        width: `${props.width}px`,
        height: `${props.length}px`
      }}
    />
  );
}

export function App(props: { subsecond: number }): JSX.Element {
  return <Hand rotate={props.subsecond} class="subsecond" length={85} width={5} />;
}

export function App2(props: { subsecond: number }): JSX.Element {
  return createComponent(Hand, {
    get rotate() {
      return props.subsecond;
    },
    class: 'subsecond',
    length: 85,
    width: 5
  });
}
```

<Callout type="tip" title="Why this feels better than post-processing HTML">
The prose stays as markdown, but the rich pieces stay as real components instead of becoming DOM-replacement code after rendering.
And here a code example: `qwert`
</Callout>

## Use Solid components where structure matters

This is the useful boundary for MDX in this app:

- normal explanation text stays in markdown
- reusable UI pieces such as callouts can come from the MDX provider
- richer examples can stay in regular Solid components with existing loaders such as `?shiki`

The lower-level implementation details can still reuse the current Shiki-based code block pipeline:

```tsx
import { Component, JSX, untrack } from 'solid-js';

export function createComponent<T extends Record<string, any>>(Comp: Component<T>, props: T): JSX.Element {
  return untrack(() => Comp(props || ({} as T)));
}
```

> MDX does not remove the need for components. It gives you a cleaner place to mix prose and components without inventing a custom markdown schema.

## References

<ReferenceCard>
  <ReferenceLink href="https://mdxjs.com/packages/rollup/">@mdx-js/rollup</ReferenceLink>
  <ReferenceLink href="https://mdxjs.com/guides/injecting-components/">
  Injecting MDX components
  </ReferenceLink>
  <ReferenceLink href="https://docs.solidjs.com/concepts/components/props">Solid props concept docs</ReferenceLink>
</ReferenceCard>

```tsx
const resolved = children(() => props.children);

type ResolvedJSXElement = number | boolean | Node | string | null | undefined;

function Example(props) {
  const content = children(() => props.children);

  return <div>{content()}</div>;
}
```

```html
<pre>
  <code>Test code</code>
</pre>
```
