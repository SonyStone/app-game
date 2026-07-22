# @app-game/solid-virtual

Headless fixed-height, dynamic-height, and genuinely nested virtualization for Solid collections.

The package creates no component, provider, wrapper, or application key. It returns recursive render data and ref callbacks; the caller owns all DOM and styling.

## Install

```sh
pnpm add @app-game/solid-virtual solid-js
```

## Create a virtual tree

```tsx
import { createVirtualNestedList } from '@app-game/solid-virtual';
import { createSignal, For, Show, type JSX } from 'solid-js';

const [scroller, setScroller] = createSignal<HTMLDivElement>();

const virtual = createVirtualNestedList({
  items,
  getChildren: (item) => item.children,
  elementRef: scroller,
  estimateOwnHeight: 120,
  overscan: 600,
  gap: 8
});

function renderLevel(
  level: Pick<typeof virtual, 'children' | 'paddingTop' | 'paddingBottom'>,
  setChildrenRef?: (element: HTMLElement) => void
): JSX.Element {
  return (
    <div
      ref={(element) => setChildrenRef?.(element)}
      style={{
        'padding-top': `${level.paddingTop}px`,
        'padding-bottom': `${level.paddingBottom}px`
      }}
    >
      <For each={level.children()}>
        {(node) => (
          <article ref={node.setElementRef}>
            {node.item.title}
            <Show when={node.childCount > 0}>{renderLevel(node, node.setChildrenRef)}</Show>
          </article>
        )}
      </For>
    </div>
  );
}
```

Attach `setElementRef` to the complete item branch. Attach `setChildrenRef` to the exact recursive child-level element. The virtualizer subtracts that child region when measuring the parent item's own height.

A flat list can use the same API by returning no children, or use the smaller
`createVirtualDynamicList` entry point shown below.

## Create a dynamic flat list

```tsx
import { createVirtualDynamicList } from '@app-game/solid-virtual/createVirtualDynamicList';

const virtual = createVirtualDynamicList({
  items,
  elementRef: scroller,
  estimateHeight: 120,
  overscan: 600,
  gap: 8
});
```

It delegates to the nested engine with no children, so it returns the same
measurable `children()` records and supports `scrollTo(item)` and
`scrollToOffset(position)`.

## Create a fixed-height list

```tsx
import { createVirtualList } from '@app-game/solid-virtual/createVirtualList';

const virtual = createVirtualList({
  items,
  elementRef: scroller,
  rowHeight: 40,
  overscan: 2
});
```

Each record from `children()` contains `item`, `index`, `top`, and `height`.
Fixed lists can scroll with `scrollToIndex(index)` or `scrollToOffset(position)`.

## Scroll to an item

```ts
virtual.scrollTo(item);
virtual.scrollTo(item, { align: 'center', behavior: 'smooth' });
virtual.scrollToOffset(500);
```

`scrollTo` uses source-item identity and returns whether it found a scrollable, currently laid-out target. An item hidden below a collapsed ancestor returns `false`; expand its ancestors first. If the same source value occurs more than once, the first document-order occurrence wins.

Supported alignment values are `start`, `center`, `end`, and `nearest`. The default is `nearest`.

## Expansion

Expansion state stays in the application:

```ts
const virtual = createVirtualNestedList({
  // ...
  isExpanded: (item) => !collapsedItems.has(item)
});
```

Collapsed descendants remain in the internal tree, preserving their measured layout data, but do not participate in the current layout or rendering.

## Public surface

| Import                                             | Runtime export             |
| -------------------------------------------------- | -------------------------- |
| `@app-game/solid-virtual`                          | `createVirtualNestedList`  |
| `@app-game/solid-virtual/createVirtualDynamicList` | `createVirtualDynamicList` |
| `@app-game/solid-virtual/createVirtualList`        | `createVirtualList`        |

Derive local types from the function and returned value:

```ts
type Options<T> = Parameters<typeof createVirtualNestedList<T>>[0];
type VirtualTree<T> = ReturnType<typeof createVirtualNestedList<T>>;
```

`VirtualNestedListProps<T>` is also exported for consumers that need the options type at an API boundary.

The repository examples live beside the package in `examples/`. The workspace
route `/solid-virtual` links to the fixed/dynamic comparison and the nested SVG
document demo. Example-only editors and `VirtualScrollPreview` are not part of
the published runtime surface.

## Runtime requirements

- Solid 1.9 or newer.
- A browser with `ResizeObserver` for live measurement.
- Server rendering is safe; measurement and scrolling begin when an element becomes available.

Resize entries are coalesced and applied on the next animation frame. This keeps DOM writes outside the observer delivery loop and limits measurement invalidation to once per frame.

Use `overflow-anchor: none` on the scroller when relying on the virtualizer's own scroll correction.
