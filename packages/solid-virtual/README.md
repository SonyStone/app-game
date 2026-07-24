# @app-game/solid-virtual

Headless fixed-height, dynamic-height, and genuinely nested virtualization for Solid collections.

The package creates no component, provider, wrapper, or application key. The caller owns the DOM,
recursive JSX, expansion state, and styling.

## Install

```sh
pnpm add @app-game/solid-virtual solid-js
```

## Create a flat virtual list

Flat fixed-height layout is the optimized default:

```tsx
import { createVirtualList } from '@app-game/solid-virtual';

const virtual = createVirtualList({
  items,
  elementRef: scroller,
  itemHeight: 40,
  overscan: 600
});
```

Pass `createDynamicHeight()` when the DOM determines item height. Use
`createDynamicGap()` when CSS determines the space between rows:

```tsx
import { createDynamicGap, createDynamicHeight, createVirtualList } from '@app-game/solid-virtual';

const gap = createDynamicGap();
const virtual = createVirtualList({
  items,
  elementRef: scroller,
  itemHeight: createDynamicHeight<Item>({
    estimate: (item) => estimateHeight(item)
  }),
  overscan: 600,
  gap
});

return (
  <div ref={gap.setElementRef} class="flex flex-col gap-2">
    {/* Render virtual children here. */}
  </div>
);
```

Attach `setElementRef` to the exact element whose direct children receive the
CSS `row-gap`, which may differ from the scroll element. The feature observes
that element's class, inline style, and size plus window resizes. Call
`gap.refresh()` after an external stylesheet or ancestor-only change that does
not trigger one of those observations.

## Create a nested virtual list

Use the dedicated recursive primitive to preserve actual collection levels:

```tsx
import { createVirtualNestedList } from '@app-game/solid-virtual';

const virtual = createVirtualNestedList({
  items,
  elementRef: scroller,
  itemHeight: 20,
  getChildren: (item) => item.children,
  isExpanded: (item) => !collapsedItems.has(item),
  overscan: 600,
  gap: 0
});
```

Dynamic measurement uses the same nested entry point:

```tsx
const virtual = createVirtualNestedList({
  items,
  elementRef: scroller,
  itemHeight: createDynamicHeight<Item>({
    estimate: (item) => estimateHeight(item)
  }),
  getChildren: (item) => item.children,
  isExpanded,
  overscan: 600,
  gap: 8
});
```

`createVirtualList()` owns the optimized flat fixed-height path and optional flat measurement.
`createVirtualNestedList()` owns recursive topology and per-level ranges. It never flattens
descendants into rows. `createDynamicHeight()` supplies optional DOM measurement to either entry
point; the nested layout consumes its height capability without changing its recursive renderer.

`itemHeight` describes only an item's own content, excluding descendants and `gap`. `overscan` and
`gap` are always measured in pixels.

## Render a nested list

```tsx
import { For, Show, type JSX } from 'solid-js';

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
            <div>{node.item.title}</div>
            <Show when={node.childCount > 0}>{renderLevel(node, node.setChildrenRef)}</Show>
          </article>
        )}
      </For>
    </div>
  );
}
```

The child level remains physically nested inside its parent branch.

Fixed-height nested renderers may omit the measurement refs. Dynamic renderers attach
`setElementRef` to the complete item branch and `setChildrenRef` to its exact recursive child level.
The measurement strategy subtracts the child region from the parent's own height and anchors
scrolling when estimates above the viewport change.

## Outputs

Fixed flat children contain `item`, `index`, `top`, and `height`. The result supports:

```ts
virtual.children();
virtual.totalHeight;
virtual.paddingTop;
virtual.paddingBottom;
virtual.scrollPosition;
virtual.viewportHeight;
virtual.itemHeight;
virtual.gap;
virtual.scrollToIndex(index);
virtual.scrollToOffset(position);
```

Dynamic flat or nested children additionally expose layout and measurement data:

```ts
node.item;
node.depth;
node.childCount;
node.top;
node.ownHeight;
node.height;
node.childrenHeight;
node.paddingTop;
node.paddingBottom;
node.children();
node.setElementRef;
node.setChildrenRef;
```

These modes support source-identity scrolling:

```ts
virtual.scrollTo(item);
virtual.scrollTo(item, { align: 'center', behavior: 'smooth' });
virtual.scrollToOffset(500);
```

`scrollTo` returns `false` when the item is absent, hidden below a collapsed ancestor, or no scroll
element is available. Repeated identical source values resolve to their first document-order
occurrence.

## Public surface

| Import                                            | Runtime export                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@app-game/solid-virtual`                         | `createVirtualList`, `createVirtualNestedList`, `createDynamicHeight`, and `createDynamicGap` |
| `@app-game/solid-virtual/createVirtualList`       | `createVirtualList`                                                                           |
| `@app-game/solid-virtual/createVirtualNestedList` | `createVirtualNestedList`                                                                     |
| `@app-game/solid-virtual/createDynamicHeight`     | `createDynamicHeight`                                                                         |
| `@app-game/solid-virtual/createDynamicGap`        | `createDynamicGap`                                                                            |

The root export also provides `FixedVirtualListProps`, `DynamicVirtualListProps`,
`VirtualListProps`, `VirtualNestedListProps`, `VirtualNestedList`, and `VirtualNestedItem`.

The workspace examples are available at:

- [`/solid-virtual`](./examples/fixed-height/index.tsx): fixed flat list.
- [`/solid-virtual/dynamic-height`](./examples/dynamic-height/index.tsx): dynamic flat list with a live CSS gap control.
- [`/solid-virtual/fixed-tree`](./examples/fixed-tree/index.tsx): fixed nested tree.
- [`/solid-virtual/nested-tree`](./examples/nested-tree/index.tsx): dynamic nested tree.

Each routed example has a matching folder under `examples/`. Unrouted prototypes live in
`experiments/`. Example-only renderers and `VirtualScrollPreview` are not part of the published
runtime surface.

## Runtime requirements

- Solid 1.9 or newer.
- A browser with `ResizeObserver` for live measurement.
- Server rendering is safe; measurement and scrolling begin when an element becomes available.

Resize entries are coalesced and applied on the next animation frame. Use `overflow-anchor: none` on
the scroller when relying on the virtualizer's own dynamic-height scroll correction.
