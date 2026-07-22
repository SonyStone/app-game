# createVirtualNestedList

> Status: living design doc.
>
> Purpose: explain current system, discuss changes, record decisions.

## TL;DR

One headless Solid primitive. No provider. No virtualizer component. No render callback.

```text
createVirtualNestedList
├── owns tree math, visibility, measurement, scroll correction
├── scrolls to source items or absolute offsets
└── returns recursive children() arrays + layout data

example
├── owns scroller DOM
├── owns recursive JSX
├── owns item components
├── parses a real SVG document into input data
├── renders that parsed tree as a live SVG through Dynamic
└── owns debug preview
```

Flat list = items with no children. Same primitive. Same algorithm.

Current demo imports `tiger.svg` as text. `DOMParser` converts every SVG element into:

```ts
{
  index: number;
  component: string;
  children: NestedItem[];
} & Record<string, string | number | NestedItem[]>
```

SVG attributes live directly on the object. Direct text uses `textContent`. This makes a node compatible with Solid's `Dynamic` after its nested `children` records are recursively rendered. `index` is display/debug metadata; virtualizer does not use it as a key.

The record value includes `number` and `NestedItem[]` because TypeScript string index signatures also cover named `index` and `children` properties. An intersection with plain `Record<string, string>` would incorrectly require those properties to be strings.

Example wraps parsed records with `createMutable`. Each SVG attribute has its own labeled textarea. Editing mutates that attribute directly and updates both virtualized and regular views.

Attribute editors are keyed by attribute name, not `[name, value]` entry tuples. Changing a value therefore updates the existing textarea instead of replacing its DOM node, focus, or caret.

Expanded state lives in a `ReactiveSet<number>` of collapsed document indexes. Direct `add` and `delete` mutations notify only consumers that read the affected index. Primitive receives `isExpanded`; renderer shows a disclosure button only for elements with children.

A collapsed item renders only its header. Its attribute editor, descendant region, optional legacy footer, and resize handle are unmounted until it expands again.

Files:

- [src/index.ts](./src/index.ts): published headless primitive.
- [README.md](./README.md): consumer guide and package contract.
- [test/createVirtualNestedList.test.ts](./test/createVirtualNestedList.test.ts): public behavior tests.
- [examples/virtual-scroll-nested/index.tsx](./examples/virtual-scroll-nested/index.tsx): recursive demo rendering, regular-list comparison, and preview.

## Public API

```tsx
const [scroller, setScroller] = createSignal<HTMLDivElement>();

const virtual = createVirtualNestedList({
  items: () => nestedItems,
  getChildren: (item) => item.children,
  elementRef: scroller,
  estimateOwnHeight: (item) => estimate(item),
  overscan: 800,
  gap: 8
});
```

### Input

| Prop                | Meaning                                                    |
| ------------------- | ---------------------------------------------------------- |
| `items`             | Root items or accessor.                                    |
| `getChildren`       | Direct children. Empty/`undefined` = leaf.                 |
| `elementRef`        | Scroll element or accessor.                                |
| `isExpanded`        | Include descendants. Default: expanded.                    |
| `estimateOwnHeight` | Own item height estimate. Excludes descendants + gap.      |
| `overscan`          | Extra visible pixels before + after viewport. Default 600. |
| `gap`               | Space after each complete branch. Default 8.               |

No application key. No renderer. No class/ARIA/preview props.

### Root output

```ts
virtual.children();
virtual.totalHeight;
virtual.paddingTop;
virtual.paddingBottom;
virtual.scrollPosition;
virtual.viewportHeight;
virtual.gap;
virtual.scrollTo(item, { align: 'nearest', behavior: 'auto' });
virtual.scrollToOffset(position, { behavior: 'auto' });
```

`scrollTo` finds the first source item matching with `Object.is`. It returns `false` when the source item is absent, below a collapsed ancestor, or no scroller is available. Hidden targets must be expanded by the application first.

Alignment supports `start`, `center`, `end`, and `nearest`. `scrollToOffset` remains available for the debug preview and other coordinate-based controls. Both methods clamp their destination to the current layout.

### Item output

Every visible item contains:

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

Root + node share level fields:

```text
children()
paddingTop
paddingBottom
```

Thus same recursive renderer accepts root or node.

Types normally inferred. Props type uses:

```ts
Parameters < typeof createVirtualNestedList < T >> [0];
```

Consumer can derive other local types from `typeof virtual` or `ReturnType<>`.

## Rendering

Simplified example:

```tsx
<div ref={setScroller} class="overflow-auto">
  {renderLevel(virtual)}
</div>
```

```tsx
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
          <Item ref={node.setElementRef} item={node.item}>
            <Show when={node.childCount > 0}>{renderLevel(node, node.setChildrenRef)}</Show>
          </Item>
        )}
      </For>
    </div>
  );
}
```

This helper belongs to application/example. Primitive creates no JSX.

Current example passes the recursive child level into `Item`. The resulting child DOM is a descendant of that parent card, not a visually indented sibling.

## Critical measurement contract

Nested branch needs two explicit refs:

- `node.setElementRef`: complete parent branch element, including rendered children.
- `node.setChildrenRef`: exact recursive child-level element inside that branch.

Primitive measures the space before and after child region. It does not count child region as parent's own height.

Correct geometry:

```text
measured parent branch
├── before child level         beforeChildren
├── recursive child level      childrenHeight
└── after child level          afterChildren

outside branch                 gap
```

```text
ownHeight    = beforeChildren + afterChildren
branchHeight = ownHeight + childrenHeight + gap
```

This supports real DOM nesting without double-counting descendants. No DOM query or class-name convention is hidden inside primitive; caller supplies both boundaries.

## How virtualization works

### 1. Build internal tree

Primitive recursively walks `items` + `getChildren`.

It always keeps the complete internal tree. Collapse changes layout/render participation; it does not recreate nodes or discard their measurements.

Each internal node stores:

```text
item
depth
child nodes
mutable layout box
read-only public view
```

No flattened render list. Flat input naturally has only root level.

### 2. Estimate complete layout

Recursive layout walks document order.

Per node:

```text
top            = current cursor
beforeChildren = measured prefix or estimate
childrenTop    = top + beforeChildren
childrenBottom = expanded ? recursive child layout result : childrenTop
afterChildren  = measured suffix or 0
ownHeight      = beforeChildren + afterChildren
bottom         = childrenBottom + afterChildren + gap
next cursor    = bottom
```

Coordinates are root-relative. Every nested level compares against same viewport.

### 3. Find visible siblings

Viewport range:

```text
visibleTop    = max(0, scrollPosition - overscan)
visibleBottom = scrollPosition + viewportHeight + overscan
```

Each `children()` call runs two binary searches over that sibling level:

- Start: first branch where `bottom > visibleTop`.
- End: first branch where `top >= visibleBottom`.

Return half-open range `[start, end)`.

### 4. Preserve skipped space

Each level returns:

```text
paddingTop    = space before first returned child
paddingBottom = space after last returned child
```

Caller renders this space. Scrollbar keeps estimated full-tree size.

### 5. Measure mounted items

One `makeResizeObserver` observes:

- Scroll element size.
- Mounted complete item-branch elements.

Observer metadata stores internal layout-box reference. Resize entries are coalesced by target and applied on the next animation frame, keeping layout writes outside the observer delivery loop. Measurement cache:

```ts
WeakMap<
  NestedVirtualBox,
  {
    beforeChildren: number;
    afterChildren: number;
  }
>;
```

For nested nodes, primitive compares parent + child-level rectangles. Child region is subtracted from parent branch. No key lookup. No provider. No observer per item.

Accepted measurement invalidates layout through `createTrigger`.

### 6. Correct scroll

Estimate replacement above viewport could move visible content.

Resize batch accumulates prefix/suffix differences above viewport. Primitive adjusts scroll element after invalidating layout.

CSS example disables browser anchoring:

```css
overflow-anchor: none;
```

Avoid browser anchoring + manual correction together.

## Reactive state

| State                | Storage         | Changes from                                  |
| -------------------- | --------------- | --------------------------------------------- |
| Internal tree        | `createMemo`    | Items, children                               |
| Layout boxes         | Mutable objects | Layout pass                                   |
| Measurements         | `WeakMap`       | Shared ResizeObserver                         |
| Layout invalidation  | `createTrigger` | Accepted measurement batch                    |
| Scroll position      | Solid primitive | Scroll element                                |
| Viewport height      | Signal          | Initial read + ResizeObserver                 |
| Visible sibling data | Functions       | Layout, expansion, scroll, viewport, overscan |

Structural item/child replacement creates fresh internal nodes. Old measurements become garbage-collectable. Expansion changes preserve existing nodes, boxes, and measurements so the toggled item keeps its viewport position.

## Cost model

Symbols:

- `A`: all internal nodes.
- `N`: nodes participating in expanded layout.
- `S`: sibling count in one level.
- `V`: rendered item count.
- `E`: entries in resize batch.

| Work                    | Cost                      |
| ----------------------- | ------------------------- |
| Build tree              | `O(A)`                    |
| Recalculate full layout | `O(N)`                    |
| Find one visible level  | `O(log S)`                |
| Slice visible level     | `O(visible siblings)`     |
| Mounted item DOM        | About `O(V)`              |
| Process resize batch    | `O(E)` + one invalidation |
| Find item for scroll    | `O(A)`                    |
| Stored virtual state    | `O(A)`                    |

Main suspected performance limit remains full `O(N)` layout after measurement. Measure before optimizing.

Headless API removes component/provider overhead and caller-DOM inspection. It does not remove full-tree math.

## Example ownership

Example owns:

- Recursive `renderLevel` function.
- Scroll container DOM, classes, ARIA.
- `Item` component.
- Physical parent-child DOM nesting.
- Nested indentation, containment, and branch gap rendering.
- Tree-item/group semantics + visual branch guides.
- Per-attribute editors backed by the mutable parsed tree.
- Stable attribute-editor DOM identity while values change.
- Recursive `Dynamic` rendering of the mutable tree as native SVG DOM.
- Shared expand/collapse state for virtualized and regular views.
- Header-only collapsed cards.
- `VirtualScrollPreview`.
- Side-by-side regular list.

Preview consumes primitive state. Preview affects no virtualization decisions.

## Validation

Current tests prove:

- Recursive visible output.
- Root-relative layout values.
- Per-level virtual padding.
- Same primitive handles flat input.
- Collapsed descendants omitted.
- Repeated application values accepted.
- Scrolling to off-screen nested items.
- Item alignment and absolute-offset clamping.
- Hidden, missing, and unavailable scroll targets return `false`.

Commands:

```sh
pnpm --filter @app-game/solid-virtual check
pnpm --filter @app-game/web build
```

Missing: real browser resize + scroll correction coverage.

Latest manual browser smoke:

- Side-by-side regular list + preview rendered.
- Child `<li>` is a real descendant of parent `<li>`.
- Child box remains inside parent border.
- Parsed `tiger.svg` into 482 nested element records.
- Only 10 elements mounted at top; 12 mounted at bottom.
- Scrolling reached final SVG node `481`; mounted descendants remained inside their parent DOM branches.
- Editing root `height` to `900` updated both views.
- Collapsing root removed descendants and reduced scroll height from `101520` to `234`; expanding restored both.
- Collapsing and expanding node `20` at a mid-list scroll position kept its viewport top at `392` px with zero scroll delta.
- Editing root `height` kept the same textarea DOM node, focus, and caret.
- The live SVG contained all 482 parsed elements in the SVG namespace; editing `height` updated it immediately.
- Collapsing root left only its header mounted: one direct child and zero textareas; expanding restored its body.
- Dragging the debug preview scrolled through the package's `scrollToOffset` API and refreshed the mounted range.
- Loading, scrolling, collapsing, and expanding produced no browser console errors or ResizeObserver loop warnings after resize work moved to animation frames.
- Nested items omit the unused ID footer.
- No application console errors after reload.

## Decisions

### D-001: One algorithm for flat + nested

Status: accepted; implemented.

Flat = zero-child case.

### D-002: One shared ResizeObserver

Status: accepted; implemented.

Use `makeResizeObserver`. Never observer per item.

### D-003: Preview + comparison outside primitive

Status: accepted; implemented.

Both live in example.

### D-004: Semantic measurement invalidation

Status: accepted; implemented.

Use `createTrigger`, not fake numeric version.

### D-005: No application keys

Status: accepted; implemented.

Internal references own measurements + observer metadata.

### D-006: Headless recursive primitive

Status: accepted; implemented.

The nested entry point exports `createVirtualNestedList`. It returns render-ready recursive data. Caller owns JSX.

### D-007: Dedicated package

Status: accepted; implemented.

The primitive lives in `@app-game/solid-virtual`. Demo components, parsed SVG data, and debug preview live beside it under `examples/`, outside the published runtime surface.

### D-008: Identity-based item scrolling

Status: accepted; implemented.

`scrollTo(item)` uses source identity instead of restoring application keys. Coordinate scrolling has the separate `scrollToOffset` name so numeric source items are unambiguous.

### D-009: Consolidated virtual package

Status: accepted; implemented.

The package owns three headless entry points:

- `createVirtualNestedList` for recursive dynamic-height trees.
- `createVirtualDynamicList` for flat dynamic-height lists using the same measurement engine.
- `createVirtualList` for fixed-height lists.

The old UI-component virtualizers and routes were removed. Workspace examples are available under `/solid-virtual`.

## Proposals

Proposals track discussion + implementation status. Proposed changes need acceptance before implementation.

### P-001: Performance harness

Status: proposed.

Need repeatable datasets + frame measurements. Compare regular vs virtual with preview disabled during measurement.

Track:

- Layout runs.
- Mounted nodes.
- Resize entries.
- Longest frame.
- Scroll gaps/blank frames.

### P-002: Incremental subtree layout

Status: proposed; profiling required.

Store subtree heights. Propagate measurement delta through ancestors + later siblings instead of full `O(N)` layout.

Risk: reorder, expansion, binary-search correctness, scroll correction complexity.

### P-003: Logical-key branch reuse

Status: rejected for current API.

Would restore key complexity removed by P-006. Revisit only if real data replacement churn proves costly.

### P-004: Browser structural tests

Status: proposed.

Test:

- Flat + nested rendering.
- Root + nested spacers.
- Dynamic own-height resize.
- Scroll correction above viewport.
- Observer cleanup.
- Expansion and item replacement.
- Preview scrolling.

### P-005: Animation-frame scroll coalescing

Status: proposed; profiling required.

Publish at most one visibility update per frame. Risk: blank region or input lag.

### P-006: Remove application keys

Status: implemented.

No `getKey`, key generic, duplicate validation, or key lookup.

### P-007: Extract VirtualScrollPreview

Status: implemented.

Preview reads primitive state in example.

### P-008: Explicit nested-region measurement

Status: implemented.

Caller may place recursive child DOM inside parent branch. `setElementRef` marks branch; `setChildrenRef` marks exact child region. Primitive derives own height from the remaining prefix + suffix. It does not inspect class names or inject nested JSX.

### P-009: Replace component API with headless primitive

Status: implemented.

Removed `VirtualScrollNestedList`, `VirtualLevel`, `VirtualBranch`, render callback, styling props, and preview prop.

## Open questions

1. Max real node count + depth?
2. Which interaction feels slow: wheel, scrollbar drag, expansion, resize, data replacement?
3. Are heights stable after first measure?
4. Must measurement survive full item-tree replacement?
5. Should final branch keep trailing `gap`, or should gap exist only between siblings?
6. Should primitive expose diagnostics counters for performance harness?
