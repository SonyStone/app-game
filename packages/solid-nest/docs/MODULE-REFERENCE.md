# solid-nest — Module Reference

> Detailed function-level documentation for every module in the package.

---

## Table of Contents

1. [index.tsx — Public Exports](#1-indextsx--public-exports)
2. [BlockTree.tsx — Advanced Block Tree Component](#2-blocktreetsx--advanced-block-tree-component)
3. [LegacyBlockTree.tsx — Simple Block Tree API](#3-legacyblocktreetstx--simple-block-tree-api)
4. [createBlockTree.ts — Convenience Store](#4-createblocktreets--convenience-store)
5. [virtual-tree.ts — VirtualTree Class](#5-virtual-treets--virtualtree-class)
6. [Item.ts — Item Types & Factories](#6-itemts--item-types--factories)
7. [events.ts — Event Types](#7-eventsts--event-types)
8. [selection.ts — Selection Logic](#8-selectionts--selection-logic)
9. [calculateLayout.ts — Layout Engine](#9-calculatelayoutts--layout-engine)
10. [calculateTransitionStyles.ts — FLIP Math](#10-calculatetransitionstylests--flip-math)
11. [createAnimations.ts — Animation Orchestrator](#11-createanimationsts--animation-orchestrator)
12. [measure.ts — DOM Measurement](#12-measurets--dom-measurement)
13. [styles.ts — CSS Injection](#13-stylests--css-injection)
14. [dnd/createDnd.ts — Drag & Drop State Machine](#14-dndcreatedndts--drag--drop-state-machine)
15. [dnd/findDropTarget.ts — Drop Target Hit-Testing](#15-dndfinddroptargetts--drop-target-hit-testing)
16. [Component Files](#16-component-files)

---

## 1. index.tsx — Public Exports

```typescript
export * from './createBlockTree'; // createBlockTree()
export * from './events'; // All event types + Place
export * from './LegacyBlockTree'; // BlockTree (legacy), BlockOptions, Selection, BlockProps

export { BlockTree as AdvancedBlockTree } from './BlockTree'; // Advanced API
```

**Note**: The Legacy `BlockTree` is the default export name. The Advanced API is re-exported as `AdvancedBlockTree`. The naming is slightly confusing — internally `BlockTree.tsx` is the advanced one, but it gets renamed on export.

---

## 2. BlockTree.tsx — Advanced Block Tree Component

### `BlockTree<K, T>(props: BlockTreeProps<K, T>)`

The main rendering component. This is a single monolithic function component (~500 lines) that:

1. Creates the reactive `VirtualTree` from props
2. Initializes the DnD system via `createDnd()`
3. Initializes the animation system via `createAnimations()`
4. Handles keyboard events (Delete)
5. Handles clipboard events (Copy/Cut/Paste)
6. Handles pointer events for selection
7. Renders the tree recursively via `renderItem()`
8. Renders the drop marker overlay at the current drop target
9. Renders the drag ghost overlay

### Props

| Prop                       | Type                                 | Required | Default         | Description                       |
| -------------------------- | ------------------------------------ | -------- | --------------- | --------------------------------- |
| `root`                     | `Container<K, T>`                    | ✅       | —               | The root container                |
| `getKey`                   | `(block: T) => K`                    | ✅       | —               | Extract unique key from block     |
| `getOptions`               | `(block: T) => BlockOptions`         | ❌       | `{}`            | Block configuration (tag)         |
| `getContainers`            | `(block: T) => Container<K, T>[]`    | ❌       | `[]`            | Nested containers for a block     |
| `selection`                | `Selection<K>`                       | ❌       | —               | Current selection state           |
| `onSelectionChange`        | `(event: SelectionEvent<K>) => void` | ❌       | —               | Selection changed                 |
| `onInsert`                 | `EventHandler<InsertEvent<K, T>>`    | ❌       | —               | Blocks inserted                   |
| `onReorder`                | `EventHandler<ReorderEvent<K>>`      | ❌       | —               | Blocks reordered via drag         |
| `onRemove`                 | `EventHandler<RemoveEvent<K>>`       | ❌       | —               | Delete key pressed                |
| `onCopy`                   | `EventHandler<CopyEvent<T>>`         | ❌       | —               | Ctrl+C                            |
| `onCut`                    | `EventHandler<CutEvent<T>>`          | ❌       | —               | Ctrl+X                            |
| `onPaste`                  | `EventHandler<PasteEvent<K>>`        | ❌       | —               | Ctrl+V                            |
| `dropzone`                 | `Component<{}>`                      | ❌       | `Dropzone`      | Custom drop marker UI             |
| `placeholder`              | `Component<{ parent: K }>`           | ❌       | `Placeholder`   | Custom placeholder UI             |
| `dragContainer`            | `Component<DragContainerProps<T>>`   | ❌       | `DragContainer` | Custom drag ghost                 |
| `transitionDuration`       | `number`                             | ❌       | `200`           | Animation duration (ms)           |
| `dragThreshold`            | `number`                             | ❌       | `10`            | Mouse/pen pixels before drag      |
| `touchDragDelay`           | `number`                             | ❌       | `350`           | Touch long-press (ms) before drag |
| `fixedHeightWhileDragging` | `boolean`                            | ❌       | `false`         | Lock container height during drag |
| `multiselect`              | `boolean`                            | ❌       | `true`          | Allow multi-selection             |
| `children`                 | `Component<BlockProps<K, T>>`        | ✅       | —               | Block render function             |

`touchDragDelay` is typed only on the Advanced API's props. The Legacy `BlockTreeProps` does not declare it, although the Legacy wrapper forwards all remaining props to the Advanced component at runtime. Blocks should use `touch-action: manipulation` (or `pan-y`) so touches can still scroll before a long press completes.

### Internal Architecture

```
BlockTree component
├── VirtualTree.create() → inputTree (reactive)
├── createDnd(inputTree, ...) → { dragState, dropTarget, dragPosition, dragTree, onDragHandleDown }
├── createAnimations(inputTree) → { tree, styles }   — layout never changes during a drag
├── renderItem() — recursive renderer
│   ├── container → <div> with spacing styles, <For each={children}>
│   ├── block → <div> with outer/inner wrappers, <Dynamic component={children}>
│   └── placeholder → <div> with placeholder component
├── Drop marker → <div data-drop="line"|"into"> absolutely positioned over dropTarget().indicator,
│                 containing <Dynamic component={dropzone}>
└── Drag ghost → <Show when={dragTree}><Dynamic component={dragContainer}>
```

Dragged blocks stay in place in the rendered tree; they receive `dragging: true` (via a `draggedKeys` set derived from `dragState`), as do all blocks rendered inside the drag ghost. No item is inserted or removed while dragging, so FLIP animations only play when the input tree itself changes, e.g. after the consumer applies a drop.

The drop marker wrapper is positioned relative to the component's root element (converted from the viewport-space `indicator` rect), with `pointer-events: none` and `z-index: 50`. The drag ghost wrapper is `position: fixed` with `pointer-events: none`.

### `renderItem()` Function

The core rendering function, called recursively. For each item kind:

- **Container**: Renders a `div` with `data-kind="container"` and CSS spacing. Children rendered via `<For>`. Includes a "spacer" div at the end (used by animations to adjust container height).
- **Block**: Two nested divs — outer (holds absolute space) and inner (transforms for animation). The user's render function is called via `<Dynamic component={props.children}>`.
- **Placeholder**: Hidden by CSS when siblings exist. Visible only in empty containers.

Each container, block (inner wrapper) and placeholder element is registered in the shared `itemElements` map via a `ref`, and removed from it on unmount (only if the map still points at that element). Items rendered inside the drag ghost (`ghost: true`) are never registered, so measurement and hit-testing always see the real, in-place elements.

### Drag Handle Detection

The component scans for `[data-drag-handle]` attributes inside the pressed element:

```tsx
for (const el of ev.currentTarget.querySelectorAll('[data-drag-handle]')) {
  if (el.contains(ev.target)) {
    onDragHandleDown(ev, item.key, onTouchDragStart);
    break;
  }
}
```

Consumer blocks should add `data-drag-handle` to their draggable areas.

### Selection on Press

Mouse and pen presses select on `pointerdown`, except when `updateSelection` returns `onClick` (the block is already selected), which defers selection to `click`. Touch presses always defer: a touch may turn into a scroll, so the block is selected on tap (`click`) or, when a long press starts a drag, from the `onTouchDragStart` callback (which drops the pending click handler and selects, unless selection was deferred by `onClick`).

---

## 3. LegacyBlockTree.tsx — Simple Block Tree API

### `BlockTree<K, T>(props: BlockTreeProps<K, T>)`

A wrapper around `AdvancedBlockTree` that adapts the simpler "block-as-container" model:

**Key difference**: In the legacy API, each block IS its own container. The wrapper creates a `Container<K, T>` for each block by combining `getChildren` and `getOptions`:

```typescript
const container = (block: T): Container<K, T> => ({
  key: props.getKey(block),
  get spacing() {
    return props.getOptions?.(block)?.spacing ?? 12;
  },
  get accepts() {
    return props.getOptions?.(block)?.accepts;
  },
  get layout() {
    return props.getOptions?.(block)?.layout;
  },
  getBlocks() {
    return ownProps.getChildren?.(block) ?? [];
  }
});
```

Then passes `getContainers={(block) => [container(block)]}` to the Advanced API.

### Legacy `BlockOptions`

```typescript
type BlockOptions = {
  spacing?: number; // Pixel gap between children (default: 12)
  tag?: string; // Block's type tag for drag constraints
  accepts?: string[]; // Tags this block's container accepts
  layout?: 'list' | 'wrap';
};
```

---

## 4. createBlockTree.ts — Convenience Store

### `createBlockTree<T extends Block<T>>(init: T)`

Creates a pre-wired SolidJS store for quick prototyping. Returns an object with:

| Property                             | Type             | Description                |
| ------------------------------------ | ---------------- | -------------------------- |
| `root`                               | Store proxy      | The root block (reactive)  |
| `setRoot`                            | SetStoreFunction | Modify the root            |
| `selection`                          | `Selection<K>`   | Current selection (getter) |
| `setSelection`                       | Setter           | Update selection           |
| `getKey(block)`                      | Function         | Returns `block.key`        |
| `getChildren(block)`                 | Function         | Returns `block.children`   |
| `onSelectionChange(event)`           | Handler          | Updates selection signal   |
| `onInsert(event)`                    | Handler          | Inserts blocks into store  |
| `onReorder(event)`                   | Handler          | Moves blocks within store  |
| `onRemove(event)`                    | Handler          | Removes blocks from store  |
| `toggleBlockSelected(key, selected)` | Method           | Toggle selection           |
| `selectBlock(key)`                   | Method           | Select a block             |
| `unselectBlock(key)`                 | Method           | Unselect a block           |
| `updateBlock(key, updates)`          | Method           | Partially update a block   |

### Internal Tree Manipulation

Uses three helper functions that work on mutable `T extends Block<T>`:

- **`findBlock(root, key)`** — Recursive key lookup
- **`removeBlocks(root, keys, collect?)`** — Filters children arrays, optionally collecting removed blocks
- **`insertBlocks(root, blocks, place)`** — Splices blocks into target parent

**Important**: These are separate from (and duplicate) the VirtualTree's immutable operations. The VirtualTree manipulations are for rendering; these are for actual data mutations.

---

## 5. virtual-tree.ts — VirtualTree Class

### Class: `VirtualTree<K, T>`

#### Static

| Method   | Signature                                                              | Description                                                |
| -------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `create` | `(getRoot, getKey, getOptions, getContainers) → Accessor<VirtualTree>` | Creates a reactive tree that recomputes when inputs change |

#### Instance Properties

| Property     | Type                              | Description             |
| ------------ | --------------------------------- | ----------------------- |
| `root`       | `ContainerItem<K>`                | The root container item |
| `key`        | `(block: T) => K`                 | Key extractor           |
| `options`    | `(block: T) => BlockOptions`      | Options extractor       |
| `containers` | `(block: T) => Container<K, T>[]` | Containers extractor    |

#### Instance Methods

| Method                             | Return                        | Description                                    |
| ---------------------------------- | ----------------------------- | ---------------------------------------------- |
| `children(id)`                     | `Item<K, T>[]`                | Get child items of an item                     |
| `findBlock(key)`                   | `T \| undefined`              | Find original block by key                     |
| `findItemById(id)`                 | `Item<K, T> \| undefined`     | Find item by ItemId                            |
| `findParent(id)`                   | `ItemId \| undefined`         | Find parent of an item (**O(n)** linear scan)  |
| `containsChildBlock(block, child)` | `boolean`                     | Check if block contains child (recursive)      |
| `containsChild(item, other)`       | `boolean`                     | Check containment by ItemId                    |
| `extractBlocks(keys)`              | `VirtualTree`                 | New tree with only specified blocks under root |
| `levels()`                         | `Generator<[ItemId, number]>` | Iterate items with depth level                 |

#### Caching Strategy

`VirtualTree.create()` maintains two caches between reactivity cycles:

- `blockCache: Map<T, BlockItem>` — Reuses `BlockItem` if the same block object is seen again
- `containerCache: Map<Container, ContainerItem>` — Same for containers

This provides **referential stability** for items, which is important for SolidJS's `<For>` reconciliation.

---

## 6. Item.ts — Item Types & Factories

### Types

| Type                 | Kind            | ID Pattern | Description                                   |
| -------------------- | --------------- | ---------- | --------------------------------------------- |
| `ContainerItem<K>`   | `'container'`   | `c-{key}`  | Holds child items, has spacing/accepts/layout |
| `BlockItem<K, T>`    | `'block'`       | `b-{key}`  | User block with nested containers             |
| `PlaceholderItem<K>` | `'placeholder'` | `p-{key}`  | End-of-container sentinel                     |

### Factory Functions

| Function                                  | Creates                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `createContainerItem(container)`          | `ContainerItem` with reactive getters for spacing/accepts/layout |
| `createBlockItem(block, key, containers)` | `BlockItem`                                                      |
| `createPlaceholderItem(parent)`           | `PlaceholderItem`                                                |

### ID Helper Functions

| Function                          | Returns                |
| --------------------------------- | ---------------------- |
| `createContainerItemId(key)`      | `c-{key}` as ItemId    |
| `createBlockItemId(key)`          | `b-{key}` as ItemId    |
| `createPlaceholderItemId(parent)` | `p-{parent}` as ItemId |

---

## 7. events.ts — Event Types

### `SelectionEvent<K>`

A discriminated union with three variants:

| `kind`       | Fields                                         | When               |
| ------------ | ---------------------------------------------- | ------------------ |
| `'blocks'`   | `key: K`, `mode: SelectionMode`, `blocks: K[]` | Block clicked      |
| `'place'`    | `place: Place<K>`                              | Gap clicked        |
| `'deselect'` | (none)                                         | Click outside tree |

### `Place<K>`

```typescript
{
  parent: K;
  before: K | null;
}
```

The universal "position in tree" coordinate. `before: null` means "append at end."

### Other Events

| Type                | Fields                                  |
| ------------------- | --------------------------------------- |
| `InsertEvent<K, T>` | `blocks: T[]`, `place: Place<K>`        |
| `ReorderEvent<K>`   | `keys: K[]`, `place: Place<K>`          |
| `RemoveEvent<K>`    | `keys: K[]`                             |
| `CopyEvent<T>`      | `blocks: T[]`, `data: DataTransfer`     |
| `CutEvent<T>`       | `blocks: T[]`, `data: DataTransfer`     |
| `PasteEvent<K>`     | `place: Place<K>`, `data: DataTransfer` |

---

## 8. selection.ts — Selection Logic

### `calculateSelectionMode(ev: MouseEvent, multiselect: boolean): SelectionMode`

Determines selection mode from keyboard modifiers:

- No modifier → `Set`
- Ctrl/Cmd → `Toggle` (if multiselect enabled)
- Shift → `Range` (if multiselect enabled)
- Multiselect disabled → always `Set`

### `updateSelection<K>(tree, prev, key, mode)`

Returns `{ mode, keys: K[], onClick?: boolean }`:

- **Set**: `keys = [key]`, `onClick = true` if already selected (defers to click event)
- **Toggle**: Adds or removes `key` from `prev`
- **Range**: Selects all siblings between `prev[0]` and `key` (only works within same parent)

### `normaliseSelection<K>(tree, keys): K[]`

Walks the tree from root. If a block's key is in `keys`, all its descendants are marked. Returns `keys` with descendant keys removed. This prevents dragging a parent AND its child simultaneously.

**Caveat**: The current implementation only detects descendants through the VirtualTree's item hierarchy (block → container → block). The test file documents that it doesn't fully recurse through container items in all cases.

---

## 9. calculateLayout.ts — Layout Engine

### `calculateLayout<K>(tree, measureItem): Map<ItemId, DOMRect>`

Pure function that computes absolute positions for every item.

**Parameters**:

- `tree: VirtualTree<K, any>` — The tree structure
- `measureItem: (id: ItemId) => BlockMeasurements | undefined` — DOM measurement provider

**Algorithm**:

Maintains a `nextY` cursor. For each item type:

| Kind                 | Logic                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------- |
| **Container (list)** | Stack children vertically. Add `spacing` between non-first children. Stop at placeholder.   |
| **Container (wrap)** | Read actual DOM positions from measurements. Compute placeholder position after last child. |
| **Block**            | Process nested containers using measured child offsets (`children[].x`, `children[].y`).    |
| **Placeholder**      | Advance `nextY` by `bottom` measurement.                                                    |

**Output**: `Map<ItemId, DOMRect>` where each `DOMRect` has `{x, y, width, height}` relative to the root container's origin.

**Used by**: `calculateTransitionStyles` only. Drop targeting does not use the computed layout; it hit-tests live DOM rects (see `findDropTarget`).

---

## 10. calculateTransitionStyles.ts — FLIP Math

### `calculateTransitionStyles<K>(prevTree, nextTree, initMeasures, prevMeasures, nextMeasures)`

Computes FLIP animation data by comparing two tree layouts.

**Returns**: `{ invert: Map<ItemId, AnimationState>, play: Map<ItemId, AnimationState> }`

**AnimationState**:

```typescript
{
  size: Vec2;        // Target size
  deltaPos: Vec2;    // Position offset (from new → old)
  deltaSize: Vec2;   // Size difference (from new → old)
  transition: boolean; // Whether CSS transition is active
  level: number;     // Nesting depth (for z-index)
  inWrap?: boolean;  // Skip absolute positioning for wrap items
}
```

**Special handling**:

- **Parent delta subtraction**: Child deltas exclude their parent's delta to avoid double-counting
- **Wrap children**: Items in wrap containers get `inWrap: true`, which causes style functions to return `{}` (no absolute positioning)

### Style Helper Functions

| Function                  | Used on                 | What it produces                                         |
| ------------------------- | ----------------------- | -------------------------------------------------------- |
| `outerStyle(state)`       | Block outer wrapper     | `position: relative`, fixed `width`/`height`             |
| `innerStyle(state)`       | Block inner wrapper     | `position: absolute`, `transform`, `width`, `transition` |
| `placeholderStyle(state)` | Placeholder wrapper     | `position: absolute`, `width`, `transition`              |
| `spacerStyle(state)`      | Container bottom spacer | `margin-top` (adjusts container visual height)           |

---

## 11. createAnimations.ts — Animation Orchestrator

### `createAnimations<K, T>(input, itemElements, options)`

**Returns**: `{ tree: Accessor<VirtualTree>, styles: Accessor<Map<ItemId, AnimationState>> }`

Creates a reactive animation pipeline:

1. Watches `input()` for tree changes (`BlockTree` passes the input tree directly, so this fires when consumer data changes — never during a drag)
2. On change, starts the FLIP generator
3. Generator yields control at each phase (measure, apply, wait)
4. `createEffect` drives the generator forward, using `setTimeout` for non-zero delays

**Phase timing**:

```
yield 0    → synchronous re-render (microtask)
yield 10   → 10ms delay for browser paint
yield 200+ → wait for transition to complete
```

**Key invariant**: `tree` (the output signal) is always one step behind `input` during animation. It updates to the new tree at the "L" (Last) phase of FLIP.

---

## 12. measure.ts — DOM Measurement

### `measureBlocks(root, blocks): Map<ItemId, BlockMeasurements>`

Measures every registered element:

1. Sets `data-measuring` attribute on root (hides spacers via CSS)
2. For each element, calls `measureBlock()`
3. Removes `data-measuring`

### `measureBlock(key, block): BlockMeasurements`

For a single element:

1. Gets `getBoundingClientRect()` as `container`
2. Scans `.solidnest-block` child elements (skipping nested ones via `lastNode.contains()`)
3. Computes relative offsets `{x, y, w}` for each child
4. Computes `bottom` (remaining height below last child)

### `measureInnerBlocks(blocks): Map<ItemId, DOMRect | undefined>`

Simple: returns `getBoundingClientRect()` for every element. Used as the "First" measurement in FLIP.

### `BlockMeasurements` Type

```typescript
{
  container: DOMRect;         // Element's bounding rect
  children: {                 // Child element offsets
    x: number;                // Horizontal offset from container
    y: number;                // Vertical offset from previous child's bottom
    w: number;                // Width difference from container
    id?: string;              // data-id attribute value
  }[];
  bottom: number;             // Remaining height below last child
}
```

---

## 13. styles.ts — CSS Injection

### Constants

| Name          | Value                    | Purpose                                    |
| ------------- | ------------------------ | ------------------------------------------ |
| `blockClass`  | module-generated         | CSS class on all item wrappers             |
| `spacerClass` | module-generated         | CSS class on container bottom spacers      |
| `durationVar` | `'--solidnest-duration'` | CSS custom property for animation duration |
| `spacingVar`  | `'--solidnest-spacing'`  | CSS custom property for container spacing  |

### Stylesheet loading

Importing `styles.ts` loads `styles.module.css`. Block and spacer selectors use the exported module classes; no stylesheet is adopted into the document at runtime.

---

## 14. dnd/createDnd.ts — Drag & Drop State Machine

### `createDnd<K, T>(tree, options, itemElements, getBlocksToDrag, onReorder)`

Pointer-driven reordering over a layout that stays still while dragging. Dragged blocks are neither removed nor replaced by a gap; the component only tracks the drag, the pointer and the current drop target.

**Parameters**:

- `tree` — Reactive input `VirtualTree` accessor (the same tree that is rendered)
- `options` — `Accessor<{ dragThreshold: number; touchDragDelay: number }>`
- `itemElements` — Shared element map, used to measure live DOM rects
- `getBlocksToDrag` — Returns blocks to drag for a pressed key (respects multi-selection)
- `onReorder` — Callback for a completed drop

**Returns**:

```typescript
{
  dragState: Accessor<DragState<K> | undefined>;          // Current drag info
  dropTarget: Accessor<DropTarget<K> | undefined>;        // Current drop target (see findDropTarget)
  dragPosition: Accessor<DOMRect>;                        // Ghost rect: pointer + offset, dragged block size
  dragTree: Accessor<VirtualTree<K, T> | undefined>;      // tree.extractBlocks(keys), for the ghost
  onDragHandleDown: (ev: PointerEvent, key: K, onTouchDragStart: () => void) => void; // Entry point
}
```

### DragState

```typescript
{
  keys: K[];           // Keys being dragged
  topItem: ItemId;     // Block ItemId of the dragged block that contains the pressed one
  offset: Vec2;        // Offset from the pointer to the block's top-left corner
  size: Vec2;          // Size of the dragged block
  tags: string[];      // Combined tags of all dragged blocks
}
```

### Gesture Lifecycle

Gesture state lives in a plain variable (not signals) because event handlers need current values synchronously. Only signals exposed to rendering (`dragState`, `dropTarget`, pointer position) are reactive.

1. **Arm** — `onDragHandleDown` ignores non-primary buttons and presses while another gesture is active. It attaches document listeners (`pointermove`, `pointerup`, `pointercancel`, capturing `scroll`, non-passive `touchmove`, `contextmenu`, `keydown`) through one `AbortController`. Pointer events are matched by `pointerId`.
2. **Start**
   - **Mouse / pen**: the drag starts once the pointer has moved `dragThreshold` pixels (default `10`).
   - **Touch**: the drag starts after a long press of `touchDragDelay` milliseconds (default `350`). Moving more than 10px before that abandons the gesture so the browser can scroll. When a long press starts a drag, `onTouchDragStart` is called so `BlockTree` can select the block.
   - Starting measures the top dragged block; if it isn't mounted the gesture ends. The scroller is the nearest ancestor of the root container with `overflow-y: auto | scroll` that actually overflows, falling back to `document.scrollingElement`.
3. **Drag** — a `requestAnimationFrame` loop auto-scrolls the scroller when the pointer is within `min(48px, height / 4)` of its top or bottom edge (up to 16px per frame, faster closer to the edge). When anything scrolled or the pointer/content moved since the last frame, it calls `findDropTarget` and updates `dropTarget` only if the target actually changed (same kind, place and indicator rect).
4. **Drop** — on `pointerup` the gesture ends, and if there was a drag with a target, `onReorder({ keys, place })` fires.
5. **Cancel** — `pointercancel`, Escape, or component cleanup end the gesture without reordering.

While a gesture is active, `touchmove` is prevented once dragging (and for pen/mouse presses on a handle, which never scroll), and the context menu is suppressed so a long press doesn't open it.

---

## 15. dnd/findDropTarget.ts — Drop Target Hit-Testing

### `findDropTarget<K, T>(tree, dragged, tags, pointer, measure): DropTarget<K> | undefined`

Hit-tests the pointer against the rendered layout, which stays static while dragging.

**Parameters**:

- `tree` — The rendered (input) tree
- `dragged` — `ReadonlySet<K>` of dragged keys; these blocks (and therefore everything inside them) are ignored, so a group can't be dropped into itself
- `tags` — Tags of the blocks being dragged; a container accepts the drag when every tag is in its `accepts`
- `pointer` — Pointer position in viewport coordinates
- `measure` — Returns the current viewport rect of a rendered item, or `undefined` when it isn't mounted

**Returns** `undefined` when no accepting container is under the pointer, otherwise:

```typescript
type DropTarget<K> = {
  place: Place<K>;
  kind: 'line' | 'into'; // line: between blocks; into: outlines a collapsed block receiving the drop
  indicator: DOMRect; // Where to draw the marker, in viewport coordinates
};
```

**Rules**:

1. **Deepest accepting container wins.** Starting at the root, the search descends into the block under the pointer and into any of its containers under the pointer; if nothing deeper accepts, the enclosing accepting container is used.
2. **Reading-order placement.** Inside a container, measured blocks are read in document order and the drop goes before the first block that follows the pointer: blocks below the pointer follow it, blocks above don't, and for the row the pointer is in, **full-width rows** (width ≥ 75% of the container's width) split at their vertical centre while **cells that share a row** split at their horizontal centre.
3. **Indicators.** Before/after a full-width row → horizontal line half the container's spacing above/below it. Beside a cell → vertical line half the spacing left/right of it. Pointing past the end of a row anchors the marker after that row's last cell rather than before the next row's first cell (same `place`). An empty container gets a line at its top. Lines are 3px thick.
4. **"Into" drops on headers.** Pointing at the header of a block whose container _explicitly_ accepts the tags (non-empty `accepts`) drops into that container. An empty `accepts` never turns a block into a target, otherwise every leaf in the Legacy API (which always gets a container) would swallow drops.
   - Collapsed (container not mounted): `kind: 'into'`, `place.before = null`, indicator is the block's rect.
   - Expanded: a line at the start of the container (before its first block). Pointing below the header places within the expanded container's flow.
5. **Edge zones.** When the block's own parent also accepts the drag, the outer 25% of the header (top edge; and bottom edge when collapsed) means before/after the block instead of into it.

Tested in `test/findDropTarget.test.ts`.

---

## 16. Component Files

### `components/DragContainer.tsx`

Default drag ghost. Shows up to 3 stacked copies of the dragged block, offset by 6px each.

```typescript
DragContainerProps<T> = { blocks: T[]; children: JSX.Element }
```

### `components/Dropzone.tsx`

Default drop marker. A rounded div with light background and blue border that fills its wrapper (`height: 100%`). The wrapper is sized to the drop target's indicator rect — a 3px line between blocks, or the whole block for an `into` drop — and carries `data-drop="line"` or `data-drop="into"` for styling.

### `components/Placeholder.tsx`

Default empty placeholder. Just an empty `<div>`.

All three are replaceable via props on the `BlockTree` component.
