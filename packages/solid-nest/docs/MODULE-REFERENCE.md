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
15. [dnd/getInsertionPoints.ts — Drop Target Calculator](#15-dndgetinsertionpointsts--drop-target-calculator)
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

The main rendering component. This is a single monolithic function component (~465 lines) that:

1. Creates the reactive `VirtualTree` from props
2. Initializes the DnD system via `createDnd()`
3. Initializes the animation system via `createAnimations()`
4. Handles keyboard events (Delete)
5. Handles clipboard events (Copy/Cut/Paste)
6. Handles pointer events for selection
7. Renders the tree recursively via `renderItem()`
8. Renders the drag ghost overlay

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
| `dropzone`                 | `Component<{}>`                      | ❌       | `Dropzone`      | Custom dropzone UI                |
| `placeholder`              | `Component<{ parent: K }>`           | ❌       | `Placeholder`   | Custom placeholder UI             |
| `dragContainer`            | `Component<DragContainerProps<T>>`   | ❌       | `DragContainer` | Custom drag ghost                 |
| `transitionDuration`       | `number`                             | ❌       | `200`           | Animation duration (ms)           |
| `dragThreshold`            | `number`                             | ❌       | `10`            | Pixels to move before drag starts |
| `fixedHeightWhileDragging` | `boolean`                            | ❌       | `false`         | Lock container height during drag |
| `multiselect`              | `boolean`                            | ❌       | `true`          | Allow multi-selection             |
| `children`                 | `Component<BlockProps<K, T>>`        | ✅       | —               | Block render function             |

### Internal Architecture

```
BlockTree component
├── VirtualTree.create() → inputTree (reactive)
├── createDnd() → { treeWithDropzone, dragTree, dragState, ... }
├── createAnimations(treeWithDropzone) → { tree, styles }
├── renderItem() — recursive renderer
│   ├── container → <div> with spacing styles, <For each={children}>
│   ├── block → <div> with outer/inner wrappers, <Dynamic component={children}>
│   ├── placeholder → <div> with placeholder component
│   └── gap → <div> with dropzone component
└── Drag ghost → <Show when={dragTree}><Dynamic component={dragContainer}>
```

### `renderItem()` Function

The core rendering function, called recursively. For each item kind:

- **Container**: Renders a `div` with `data-kind="container"` and CSS spacing. Children rendered via `<For>`. Includes a "spacer" div at the end (used by animations to adjust container height).
- **Block**: Two nested divs — outer (holds absolute space) and inner (transforms for animation). The user's render function is called via `<Dynamic component={props.children}>`.
- **Placeholder**: Hidden by CSS when siblings exist. Visible only in empty containers.
- **Gap (Dropzone)**: Shows the drop indicator during drag.

### Drag Handle Detection

The component scans for `[data-drag-handle]` attributes inside the clicked element:

```tsx
for (const el of ev.currentTarget.querySelectorAll('[data-drag-handle]')) {
  if (el.contains(ev.target)) {
    onDragHandleClick(ev, item.key);
    break;
  }
}
```

Consumer blocks should add `data-drag-handle` to their draggable areas.

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
| `removeBlocks(keys)`               | `VirtualTree`                 | New tree without specified blocks              |
| `removeItems(ids)`                 | `VirtualTree`                 | New tree without specified items               |
| `insertDropzone(place, height)`    | `VirtualTree`                 | New tree with gap item inserted                |
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
| `GapItem`            | `'gap'`         | `gap`      | Dropzone indicator                            |

### Factory Functions

| Function                                  | Creates                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `createContainerItem(container)`          | `ContainerItem` with reactive getters for spacing/accepts/layout |
| `createBlockItem(block, key, containers)` | `BlockItem`                                                      |
| `createPlaceholderItem(parent)`           | `PlaceholderItem`                                                |
| `createDropzoneItem(before, height)`      | `GapItem`                                                        |

### ID Helper Functions

| Function                          | Returns                       |
| --------------------------------- | ----------------------------- |
| `createContainerItemId(key)`      | `c-{key}` as ItemId           |
| `createBlockItemId(key)`          | `b-{key}` as ItemId           |
| `createPlaceholderItemId(parent)` | `p-{parent}` as ItemId        |
| `createDropzoneItemId()`          | `gap` as ItemId               |
| `isPlaceholderId(id)`             | `true` if id starts with `p-` |

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
| **Gap**              | Advance `nextY` by `bottom` measurement.                                                    |

**Output**: `Map<ItemId, DOMRect>` where each `DOMRect` has `{x, y, width, height}` relative to the root container's origin.

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

- **New dropzone**: If a gap appears in `nextTree` but not `prevTree`, its initial height is computed based on the position delta of the item after it
- **Parent delta subtraction**: Child deltas exclude their parent's delta to avoid double-counting
- **Wrap children**: Items in wrap containers get `inWrap: true`, which causes style functions to return `{}` (no absolute positioning)

### Style Helper Functions

| Function                  | Used on                 | What it produces                                                   |
| ------------------------- | ----------------------- | ------------------------------------------------------------------ |
| `outerStyle(state)`       | Block outer wrapper     | `position: relative`, fixed `width`/`height`                       |
| `innerStyle(state)`       | Block inner wrapper     | `position: absolute`, `transform`, `width`, `transition`           |
| `placeholderStyle(state)` | Placeholder wrapper     | `position: absolute`, `width`, `transition`                        |
| `spacerStyle(state)`      | Container bottom spacer | `margin-top` (adjusts container visual height)                     |
| `dropzoneStyle(state)`    | Gap/dropzone wrapper    | `position: absolute`, `transform`, `width`, `height`, `transition` |

---

## 11. createAnimations.ts — Animation Orchestrator

### `createAnimations<K, T>(input, itemElements, options)`

**Returns**: `{ tree: Accessor<VirtualTree>, styles: Accessor<Map<ItemId, AnimationState>> }`

Creates a reactive animation pipeline:

1. Watches `input()` for tree changes
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
| `blockClass`  | `'solidnest-block'`      | CSS class on all item wrappers             |
| `spacerClass` | `'solidnest-spacer'`     | CSS class on container bottom spacers      |
| `durationVar` | `'--solidnest-duration'` | CSS custom property for animation duration |
| `spacingVar`  | `'--solidnest-spacing'`  | CSS custom property for container spacing  |

### `injectCSS()`

Called once on mount. Uses `document.adoptedStyleSheets` to inject styles without creating `<style>` elements. Idempotent (checks `adopted` flag).

---

## 14. dnd/createDnd.ts — Drag & Drop State Machine

### `createDnd<K, T>(input, options, itemElements, getBlocksToDrag, onReorder)`

**Parameters**:

- `input` — Reactive VirtualTree accessor
- `options` — `{ dragRadius: Vec2, dragThreshold: number }`
- `itemElements` — Shared element map
- `getBlocksToDrag` — Returns blocks to drag (respects multi-selection)
- `onReorder` — Callback for completed reorder

**Returns**:

```typescript
{
  treeWithDropzone: Accessor<VirtualTree>;  // Tree with gap inserted
  dragTree: Accessor<VirtualTree | null>;   // Extracted blocks for ghost
  dragState: Accessor<DragState | null>;    // Current drag info
  dragPosition: Accessor<DOMRect>;          // Ghost position
  onDragHandleClick: (ev, key) => void;     // Entry point
}
```

### DragState

```typescript
{
  keys: K[];           // Keys being dragged
  topItem: ItemId;     // Top-most block ItemId
  offset: Vec2;        // Cursor offset from block origin
  size: Vec2;          // Size of the dragged block
  tags: string[];      // Combined tags of all dragged blocks
}
```

### Insertion Matching Logic

The system builds a pipeline of derived signals:

1. `treeWithoutDragged` — Input tree with dragged blocks removed
2. `insertionPoints` — All valid drop positions (from `getInsertionPoints`)
3. `insertion` — Best matching point for current pointer position
4. `treeWithDropzone` — Tree with gap item inserted at best match

For **list points**: Y-band algorithm with configurable radius (1.5× block height)
For **wrap points**: 2D Euclidean distance with height-based Y tolerance

---

## 15. dnd/getInsertionPoints.ts — Drop Target Calculator

### `getInsertionPoints<K, T>(tree, tags, measures): InsertionPoint<K>[]`

**Parameters**:

- `tree` — Tree with dragged blocks already removed
- `tags` — Tags of the blocks being dragged
- `measures` — Current DOM measurements

**Algorithm**:

1. Computes full layout via `calculateLayout()`
2. Recursively walks the tree
3. For each container, checks if `tags` are accepted (all tags must be in `container.accepts`)
4. For each accepted block/placeholder, creates an insertion point with the layout rect's position
5. Wrap-layout containers get `inWrap: true` and include x/width/height for 2D matching

**Returns** an array of:

```typescript
{
  id: ItemId;
  place: Place<K>;
  y: number;
  x?: number;        // Only for wrap layout
  width?: number;     // Only for wrap layout
  height?: number;    // Only for wrap layout
  inWrap?: boolean;
}
```

---

## 16. Component Files

### `components/DragContainer.tsx`

Default drag ghost. Shows up to 3 stacked copies of the dragged block, offset by 6px each. Has a red border for debugging.

```typescript
DragContainerProps<T> = { blocks: T[]; children: JSX.Element }
```

### `components/Dropzone.tsx`

Default drop indicator. A rounded div with light background and blue border.

### `components/Placeholder.tsx`

Default empty placeholder. Just an empty `<div>`.

All three are replaceable via props on the `BlockTree` component.
