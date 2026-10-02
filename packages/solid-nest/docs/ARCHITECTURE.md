# solid-nest — Architecture Overview

> **Version**: 0.6.2-local  
> **Framework**: SolidJS · TypeScript · Vite  
> **Purpose**: A drag-and-drop, nestable block tree component for SolidJS applications.

---

## Table of Contents

1. [What Is solid-nest?](#1-what-is-solid-nest)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Module Map](#3-module-map)
4. [Core Data Model](#4-core-data-model)
5. [Component APIs (Public Surface)](#5-component-apis-public-surface)
6. [Virtual Tree — The Heart of the System](#6-virtual-tree--the-heart-of-the-system)
7. [Drag & Drop Pipeline](#7-drag--drop-pipeline)
8. [Animation System (FLIP)](#8-animation-system-flip)
9. [Selection System](#9-selection-system)
10. [Layout Calculation](#10-layout-calculation)
11. [Measurement System](#11-measurement-system)
12. [Event System](#12-event-system)
13. [CSS & Styling Strategy](#13-css--styling-strategy)
14. [Utility Modules](#14-utility-modules)
15. [Test Suite](#15-test-suite)
16. [Playground App](#16-playground-app)
17. [Suggestions for Improvement](#17-suggestions-for-improvement)

---

## 1. What Is solid-nest?

`solid-nest` is a **SolidJS component library** that provides:

- A **nestable tree of blocks** rendered as a flat DOM list (with indentation/nesting handled by layout math)
- **Drag-and-drop reordering** within and across nested containers
- **Multi-selection** (click, ctrl+click, shift+click range select)
- **FLIP animations** for smooth transitions when blocks move
- **Clipboard events** (copy/cut/paste) integration
- Support for **tag-based drag constraints** (e.g. only "brush" blocks can go into certain containers)
- Two layout modes: **vertical list** and **flex-wrap grid**

Think of it as a Notion-style block editor's structural layer, or a Photoshop layers panel engine.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Consumer App                         │
│  (provides root data, getKey, getChildren, handlers)    │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│           BlockTree (Legacy) or AdvancedBlockTree       │
│  Public component — adapts props → internal structures  │
└────────────┬──────────────────────────────┬─────────────┘
             │                              │
             ▼                              ▼
┌────────────────────┐        ┌──────────────────────────┐
│   VirtualTree      │        │     createDnd()          │
│  Immutable tree    │◄──────►│  Pointer gestures,       │
│  data structure    │        │  auto-scroll, drop state │
└────────┬───────────┘        └──────────┬───────────────┘
         │                               │
         ▼                               ▼
┌────────────────────┐        ┌──────────────────────────┐
│ createAnimations() │        │  findDropTarget()        │
│ FLIP engine        │        │  Hit-tests live DOM rects│
└────────┬───────────┘        └──────────────────────────┘
         │
         ▼
┌────────────────────┐        ┌──────────────────────────┐
│  calculateLayout() │        │  selection.ts            │
│  Y-position math   │        │  Multi-select logic      │
└────────────────────┘        └──────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│                     DOM Output                         │
│  Nested divs with inline transition styles             │
│  + drop marker overlay (position:absolute)             │
│  + drag ghost overlay (position:fixed)                 │
└────────────────────────────────────────────────────────┘
```

### Data Flow Summary

1. **User data** (tree of blocks) → converted to a **VirtualTree** (internal immutable representation)
2. The VirtualTree is fed directly to **createAnimations**, which renders it and runs FLIP (measure before/after DOM → transition styles) whenever it changes
3. During a drag the tree is **not modified**: dragged blocks stay in place with `dragging: true`, `findDropTarget` hit-tests live DOM rects, and a drop marker overlay shows the target
4. On drop → **ReorderEvent** fired to consumer → consumer updates their store → new VirtualTree created → FLIP animates the move

---

## 3. Module Map

### Source Files (`src/`)

| File                             | Role                                                                                | Lines |
| -------------------------------- | ----------------------------------------------------------------------------------- | ----- |
| **index.tsx**                    | Public entry point; re-exports everything                                           | 6     |
| **BlockTree.tsx**                | Advanced API component (the real renderer)                                          | ~500  |
| **LegacyBlockTree.tsx**          | Legacy/simple API component (wraps Advanced)                                        | ~115  |
| **createBlockTree.ts**           | Convenience store helper (quick-start utility)                                      | ~130  |
| **virtual-tree.ts**              | `VirtualTree` class — immutable tree data structure                                 | ~165  |
| **Item.ts**                      | Item types (`BlockItem`, `ContainerItem`, `PlaceholderItem`) + factory functions    | ~65   |
| **events.ts**                    | Event types (`ReorderEvent`, `SelectionEvent`, etc.)                                | ~80   |
| **selection.ts**                 | Selection modes (Set/Toggle/Range), `updateSelection`, `normaliseSelection`         | ~100  |
| **calculateLayout.ts**           | Pure function: VirtualTree + measurements → DOMRect map                             | ~95   |
| **calculateTransitionStyles.ts** | FLIP: prev layout vs next layout → invert/play style maps                           | ~145  |
| **createAnimations.ts**          | SolidJS effect that orchestrates the FLIP animation                                 | ~65   |
| **measure.ts**                   | DOM measurement: reads `getBoundingClientRect()` from element map                   | ~55   |
| **styles.ts**                    | CSS class names, CSS custom properties, stylesheet injection                        | ~40   |
| **dnd/createDnd.ts**             | Drag-and-drop gestures (mouse/pen threshold, touch long press, auto-scroll, drop)   | ~305  |
| **dnd/findDropTarget.ts**        | Hit-tests the pointer against live DOM rects to find the drop place and marker rect | ~185  |
| **components/DragContainer.tsx** | Default drag ghost overlay component                                                | ~30   |
| **components/Dropzone.tsx**      | Default drop marker component                                                       | ~8    |
| **components/Placeholder.tsx**   | Default empty placeholder component                                                 | ~4    |
| **util/types.ts**                | `Vec2` type + namespace                                                             | ~6    |
| **util/notNull.ts**              | Type guard `notNull<T>()`                                                           | ~3    |
| **util/modifierKey.ts**          | Platform-aware Ctrl/Cmd detection                                                   | ~6    |
| **util/findIndex.ts**            | `findIndex` with start offset                                                       | ~8    |

### Test Files (`test/`)

| File                        | What it tests                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **index.test.tsx**          | Basic instantiation of both BlockTree and AdvancedBlockTree                                                          |
| **virtual-tree.test.ts**    | VirtualTree creation, findBlock, containsChildBlock, extractBlocks, findParent                                       |
| **calculateLayout.test.ts** | Layout rect computation for flat lists, nested groups, wrap layouts                                                  |
| **findDropTarget.test.ts**  | Row/cell splitting, end-of-row anchoring, dragged blocks ignored, into/beside group headers, no target, no self-drop |
| **selection.test.ts**       | Selection modes (Set/Toggle/Range), normaliseSelection                                                               |
| **setup.ts**                | Polyfill for `adoptedStyleSheets` in jsdom                                                                           |

---

## 4. Core Data Model

### The Item Hierarchy

The system converts user-provided block data into a **flat typed item model**:

```
ContainerItem       — Represents a container that holds children
  ├── BlockItem     — Represents a user block (brush, group, etc.)
  │     └── ContainerItem (nested)  — Block's child container(s)
  │           └── BlockItem ...
  └── PlaceholderItem — "Insert at end" sentinel (one per container)
```

#### Item Types

```typescript
type ItemId = string & { readonly brand: unique symbol }; // Branded string

type ContainerItem<K> = {
  id: ItemId; // "c-{key}"
  kind: 'container';
  key: K;
  spacing: number; // Gap between children (px)
  accepts: string[]; // Allowed child tags
  layout: 'list' | 'wrap';
};

type BlockItem<K, T> = {
  id: ItemId; // "b-{key}"
  kind: 'block';
  key: K;
  block: T; // Original user data
  containers: Container<K, T>[]; // Nested containers
};

type PlaceholderItem<K> = {
  id: ItemId; // "p-{key}"
  kind: 'placeholder';
  parent: K;
};
```

#### ID Convention

| Prefix    | Meaning                                 |
| --------- | --------------------------------------- |
| `c-{key}` | Container item                          |
| `b-{key}` | Block item                              |
| `p-{key}` | Placeholder (end-of-container sentinel) |

### Place — The Insertion Point

```typescript
type Place<K> = {
  parent: K; // Container key to insert into
  before: K | null; // Block key to insert before, or null = append
};
```

This is the universal coordinate system for "where in the tree." Every reorder, insert, and paste event uses a `Place`.

---

## 5. Component APIs (Public Surface)

### Dual API Design

solid-nest exposes **two** component APIs:

#### 1. `BlockTree` (Legacy API — `LegacyBlockTree.tsx`)

The simpler API, where every block is both a block _and_ a container. The consumer provides:

```typescript
type BlockTreeProps<K, T> = {
  root: T; // Root block object
  getKey: (block: T) => K; // Extract unique key
  getChildren?: (block: T) => T[]; // Get child blocks
  getOptions?: (block: T) => BlockOptions; // spacing, tag, accepts, layout
  // ... event handlers, selection, etc.
  children: Component<BlockProps<K, T>>; // Render function
};
```

This is a **thin wrapper** that converts the single-block-with-children model into the Advanced API's container model. Each block gets one implicit container.

#### 2. `AdvancedBlockTree` (New API — `BlockTree.tsx`)

The full-power API, where blocks and containers are separate concepts. A single block can have **multiple containers**:

```typescript
type BlockTreeProps<K, T> = {
  root: Container<K, T>; // Root container (not a block!)
  getKey: (block: T) => K;
  getOptions?: (block: T) => BlockOptions;
  getContainers?: (block: T) => Container<K, T>[]; // Multiple containers per block
  dragThreshold?: number; // Mouse/pen drag distance in px (default 10)
  touchDragDelay?: number; // Touch long-press in ms before dragging (default 350); not typed on the Legacy props
  // ... same event handlers, selection, etc.
  children: Component<BlockProps<K, T>>;
};

type Container<K, T> = {
  key: K;
  spacing?: number;
  accepts?: string[];
  layout?: 'list' | 'wrap';
  getBlocks: () => T[]; // Accessor for child blocks
};
```

### `createBlockTree()` — Quick-Start Convenience

A helper that creates a SolidJS store + signal for selection, pre-wired with insert/reorder/remove handlers:

```typescript
const treeProps = createBlockTree({ key: 'root', children: [...] });
return <BlockTree {...treeProps}>{(block) => <MyBlock {...block} />}</BlockTree>;
```

> **Note**: The playground app does NOT use `createBlockTree` — it manages state manually with `createStore` draft callbacks.

---

## 6. Virtual Tree — The Heart of the System

`VirtualTree<K, T>` is an **immutable tree data structure** that sits between user data and the DOM.

### Creation

```
VirtualTree.create(getRoot, getKey, getOptions, getContainers)
  → Accessor<VirtualTree>   // Reactive — recomputes when data changes
```

Internally it:

1. Walks the container → block → container hierarchy
2. Creates `ContainerItem`, `BlockItem`, `PlaceholderItem` for each node
3. Builds two maps: `_items` (id → item) and `_childMap` (id → child ids)
4. **Caches** block/container items between runs for identity stability

### Key Methods

| Method                       | What it does                                                   |
| ---------------------------- | -------------------------------------------------------------- |
| `children(id)`               | Get child items of a container or block                        |
| `findBlock(key)`             | Find the original user block by key                            |
| `findItemById(id)`           | Find any item by its ItemId                                    |
| `findParent(id)`             | Find the parent item id (linear scan)                          |
| `containsChild(item, other)` | Recursive containment check                                    |
| `extractBlocks(keys)`        | Returns a **new** tree with only specified blocks under root   |
| `levels()`                   | Iterator yielding `[ItemId, depth]` pairs (BFS-like via stack) |

### Immutability Pattern

The VirtualTree is immutable. `extractBlocks` (used for the drag ghost) returns a new instance that shares the `_items` map with a modified `_childMap` copy. Immutability is critical for the animation system, which needs to compare prev vs next tree states.

---

## 7. Drag & Drop Pipeline

The layout does **not** change during a drag. Dragged blocks stay where they are (rendered with `dragging: true`, as is the ghost), no gap or dropzone item is inserted into the tree, and `createAnimations` receives the input tree directly. FLIP animations therefore only play when the tree changes, e.g. after the consumer applies a drop.

### State Machine (`createDnd.ts`)

```
          pointerdown on [data-drag-handle]  (onDragHandleDown)
                              │
                 document listeners attached (one AbortController)
                              │
              ┌───────────────┴────────────────┐
         mouse / pen                         touch
              │                                │
   moved ≥ dragThreshold?          held still for touchDragDelay?
              │                    (moved > 10px first → abandon, browser scrolls)
              └───────────────┬────────────────┘
                              ▼
                     ┌─────────────────┐
                     │  dragState set  │   dragged blocks render with dragging: true
                     │  keys, topItem  │   dragTree → ghost (position: fixed)
                     │  offset, size   │
                     │  tags           │
                     └────────┬────────┘
                              │
                    rAF loop, every frame:
                      auto-scroll nearest scrollable ancestor near its edges
                      if pointer moved or anything scrolled:
                        findDropTarget(tree, dragged, tags, pointer, measure)
                              │
                              ▼
                     dropTarget signal → drop marker overlay
                              │
          pointerup ──────────┼────────── Escape / pointercancel / cleanup
              │                                │
   onReorder({ keys, place })            gesture ends, no reorder
   if a target exists
```

Gesture details:

- Mouse and pen drags start once the pointer travels `dragThreshold` pixels (default `10`).
- Touch keeps native scrolling: a drag starts only after a long press of `touchDragDelay` ms (default `350`); moving more than 10px first abandons the gesture so the browser scrolls. Blocks should use `touch-action: manipulation` or `pan-y` so touch can scroll.
- `touchmove` is prevented once dragging (and for pen/mouse presses on a handle); the context menu is suppressed for the duration of a gesture; Escape cancels.
- A `requestAnimationFrame` loop auto-scrolls the nearest scrollable ancestor when the pointer nears its top or bottom edge, and re-targets on pointer move or scroll, so the target follows content scrolled under a still pointer.

### Drop Targeting (`findDropTarget.ts`)

The pointer is hit-tested against **live DOM rects** from the shared element map (no layout calculation involved). The result is `{ place, kind: 'line' | 'into', indicator: DOMRect }`, or `undefined` when nothing under the pointer accepts the drag.

- The **deepest accepting container** under the pointer wins (all dragged tags must be in the container's `accepts`).
- Inside a container, blocks are read in **reading order** and the drop goes before the first block that follows the pointer. **Cells that share a row** split at their horizontal centre; **full-width rows** (≥ 75% of the container width) split at their vertical centre.
- Pointing at a **block header** whose container explicitly accepts the tags (non-empty `accepts`) drops **into** that block: `kind: 'into'` over a collapsed block, or a line at the start of an expanded one. The outer **25%** of the header still means before/after the block when its parent accepts the drag.
- Dragged blocks (and everything inside them) are ignored.

### Drop Marker

`BlockTree` renders the `dropzone` component in an absolutely positioned overlay over `dropTarget().indicator` (converted to root-relative coordinates). The wrapper carries `data-drop="line"` or `data-drop="into"` so the marker can be styled differently for lines between blocks and for outlined "into" targets.

### Selection on Touch

Touch presses select on tap (`click`), or when a long press starts a drag, rather than on `pointerdown` — a touch that turns into a scroll should not change the selection.

---

## 8. Animation System (FLIP)

### What is FLIP?

**F**irst, **L**ast, **I**nvert, **P**lay — a technique for animating layout changes:

1. **First**: Measure current positions
2. **Last**: Apply new DOM state, measure new positions
3. **Invert**: Apply CSS transforms to make elements _appear_ at their old positions
4. **Play**: Remove transforms with CSS transitions → elements animate to final positions

### Implementation (`createAnimations.ts`)

Uses a **generator function** to step through the FLIP phases:

```typescript
function* animate(prev, next) {
  // Clear styles
  setStyles(new Map());
  yield 0;                     // microtask: DOM updates

  // F: Measure "before" state
  const prevRects = measureBlocks(...);

  // L: Apply new tree, measure "after" state
  setTree(next);
  yield 0;                     // microtask: DOM updates
  const nextRects = measureBlocks(...);

  // I: Calculate inverse transforms
  const { invert, play } = calculateTransitionStyles(...);
  setStyles(invert);

  // P: Apply final transforms (with CSS transitions)
  yield 10;                    // 10ms delay for browser to paint
  setStyles(play);

  // Cleanup
  yield transitionDuration + 100;
  setStyles(new Map());
}
```

A `createEffect` drives the generator forward, using `setTimeout` for delays > 0.

### Style Calculation (`calculateTransitionStyles.ts`)

For each item present in both trees:

- Computes the **delta** between old and new positions
- Adjusts for parent deltas (so children don't double-count parent movement)
- Produces `AnimationState` objects with `deltaPos`, `deltaSize`, `transition` flag
- Separate handling for wrap-layout children (skip outer absolute positioning)

---

## 9. Selection System

### Selection Modes (`selection.ts`)

| Mode     | Trigger        | Behavior                                          |
| -------- | -------------- | ------------------------------------------------- |
| `Set`    | Plain click    | Replaces selection with clicked block             |
| `Toggle` | Ctrl/Cmd+click | Adds/removes clicked block from selection         |
| `Range`  | Shift+click    | Selects all blocks from first selected to clicked |

### Selection Model

```typescript
type Selection<K> = {
  blocks?: K[]; // Ordered list of selected block keys
  place?: Place<K>; // Insertion point (cursor position)
};
```

### Key Functions

- **`calculateSelectionMode(ev, multiselect)`** — Reads modifier keys to determine mode
- **`updateSelection(tree, prev, key, mode)`** — Computes the next selection state
- **`normaliseSelection(tree, keys)`** — Removes child keys when parent is also selected (deduplication)

### Click vs Drag Disambiguation

When clicking an already-selected block in `Set` mode, the selection update is deferred to the `click` event (not `pointerdown`) to allow drag detection. This is the `onClick` flag in `updateSelection`'s return value.

---

## 10. Layout Calculation

### `calculateLayout(tree, measureItem)` → `Map<ItemId, DOMRect>`

A pure function that computes the **virtual Y position** of every item in the tree, producing a `DOMRect` for each.

#### Algorithm

- Maintains a `nextY` cursor
- Walks the tree depth-first
- For **list containers**: stacks children vertically with spacing
- For **wrap containers**: reads actual DOM measurements to get x/y positions (since flex-wrap is non-deterministic)
- For **blocks**: processes child containers using measured offsets
- For **placeholders**: just advances `nextY` by their measured height

#### Usage

Called only by **`calculateTransitionStyles`**, to compute FLIP deltas between tree states. Drop targeting does not use it; `findDropTarget` reads live DOM rects instead.

---

## 11. Measurement System

### `measure.ts`

Two measurement functions that read from the real DOM:

#### `measureBlocks(rootId, elements)` → `Map<ItemId, BlockMeasurements>`

For each element in the map:

- Gets `getBoundingClientRect()` as the container rect
- Scans immediate `.solidnest-block` children to compute child offsets
- Returns `{ container: DOMRect, children: [{x, y, w, id}], bottom: number }`

The `bottom` value is the remaining height below the last child — important for blocks with padding.

#### `measureInnerBlocks(elements)` → `Map<ItemId, DOMRect | undefined>`

Simpler: just gets `getBoundingClientRect()` for every element. Used for the "init" measurement in FLIP (before any state changes).

### Element Map

Both `BlockTree` and `createDnd` share a `Map<ItemId, HTMLElement>` that is populated via `ref` callbacks in the render function. This is the bridge between the virtual tree and the real DOM. Entries are removed when their item unmounts, and items rendered inside the drag ghost are never registered, so measurement and drop hit-testing only see the real elements.

---

## 12. Event System

### Event Types (`events.ts`)

| Event            | When                                         | Payload                                 |
| ---------------- | -------------------------------------------- | --------------------------------------- |
| `SelectionEvent` | Block clicked, gap clicked, or click outside | `{kind, key?, mode?, blocks?, place?}`  |
| `ReorderEvent`   | Drag-and-drop completed                      | `{keys: K[], place: Place<K>}`          |
| `InsertEvent`    | External insert requested                    | `{blocks: T[], place: Place<K>}`        |
| `RemoveEvent`    | Delete key pressed                           | `{keys: K[]}`                           |
| `CopyEvent`      | Ctrl+C                                       | `{blocks: T[], data: DataTransfer}`     |
| `CutEvent`       | Ctrl+X                                       | `{blocks: T[], data: DataTransfer}`     |
| `PasteEvent`     | Ctrl+V                                       | `{place: Place<K>, data: DataTransfer}` |

### Design Pattern

All events are **externalized** — the component does not modify its own state. The consumer receives events and updates their store accordingly. This is a **controlled component** pattern (like React's controlled inputs).

The component only manages **ephemeral state** internally:

- Drag state (what's being dragged, where the pointer is, the current drop target)
- Animation state (current FLIP phase)

---

## 13. CSS & Styling Strategy

### Injected Stylesheet (`styles.ts`)

Uses `document.adoptedStyleSheets` to inject a minimal stylesheet once:

```css
.solidnest-block {
  transition: none;
}

/* Spacing between siblings */
.solidnest-block[data-kind='container'] > .solidnest-block + .solidnest-block {
  margin-top: var(--solidnest-spacing);
}

/* No margin in wrap layout */
.solidnest-block[data-kind='container'][data-layout='wrap'] > ... {
  margin-top: 0;
}

/* Hide placeholder when siblings exist */
.solidnest-block[data-kind='container'] > ... + ...[data-kind='placeholder'] {
  display: none;
}

/* Hide spacer during measurement */
.solidnest-block[data-measuring] .solidnest-spacer {
  display: none;
}
```

### CSS Custom Properties

| Variable               | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `--solidnest-spacing`  | Container-specific spacing between children |
| `--solidnest-duration` | Animation duration (set on root element)    |

### Inline Styles

The animation system applies inline styles for:

- `position: relative/absolute` on outer/inner wrappers
- `width`, `height` on outer wrappers (to hold space)
- `transform: translate(...)` on inner wrappers (for FLIP)
- `transition` on inner wrappers (during play phase)

---

## 14. Utility Modules

| Module                | Export                          | Purpose                                                         |
| --------------------- | ------------------------------- | --------------------------------------------------------------- |
| `util/types.ts`       | `Vec2`, `Vec2.Zero`             | 2D vector type used for positions/sizes                         |
| `util/notNull.ts`     | `notNull<T>()`                  | Type-narrowing filter for arrays                                |
| `util/modifierKey.ts` | `modifierKey`                   | `'metaKey'` on Mac, `'ctrlKey'` elsewhere                       |
| `util/findIndex.ts`   | `findIndex(array, pred, start)` | Like `Array.findIndex` but returns `array.length` instead of -1 |

---

## 15. Test Suite

### Configuration

- **Runner**: Vitest
- **Environment**: jsdom
- **Plugin**: vite-plugin-solid (for JSX compilation)
- **Path alias**: `src` → `./src` (matching tsconfig)
- **Setup**: Polyfills `document.adoptedStyleSheets`

### Coverage

| Area                    | Test file                 | What's tested                                                               |
| ----------------------- | ------------------------- | --------------------------------------------------------------------------- |
| Component instantiation | `index.test.tsx`          | Both APIs can render without error                                          |
| VirtualTree             | `virtual-tree.test.ts`    | create, findBlock, containsChildBlock, extractBlocks, findParent            |
| Layout                  | `calculateLayout.test.ts` | Flat list, spacing, empty tree, wrap layout placeholders                    |
| Drop targeting          | `findDropTarget.test.ts`  | Row/cell splits, end-of-row marker, into/beside group headers, no self-drop |
| Selection               | `selection.test.ts`       | All three modes, normaliseSelection                                         |

### What's NOT Tested

- The actual DnD gesture flow in `createDnd` (pointer/touch handling, auto-scroll) — covered by Playwright e2e in the playground app; `findDropTarget` is unit-tested with stubbed rects
- Animation timing and FLIP correctness
- Clipboard events
- Keyboard navigation (Delete key)
- `createBlockTree` convenience helper

---

## 16. Playground App

Located at `apps/dnd-playground/`, this is a Vite + SolidJS app that exercises solid-nest with a Photoshop-like brush panel:

- **Block types**: `GroupBlock` (folder) and `BrushBlock` (leaf)
- **Layout**: Groups use `layout: 'wrap'` with `accepts: ['group', 'brush']`
- **Features exercised**: Selection, multi-select, reorder, insert, remove
- **E2E tests**: Playwright tests covering initial render, selection, drag-and-drop, keyboard delete

### Usage Pattern

```tsx
<BlockTree
  root={root}
  getKey={(block) => block.key}
  getChildren={(block) => block.children}
  getOptions={(block) => ({
    spacing: 4,
    tag: block.type,
    accepts: ['group', 'brush'],
    layout: 'wrap'
  })}
  selection={selection()}
  onSelectionChange={setSelection}
  onReorder={(event) => {
    setRoot((draft) => {
      removeBlocks(draft, event.keys, blocks);
      insertBlocks(draft, blocks, event.place);
    });
  }}
  onRemove={(event) => { ... }}
>
  {(props) => <MyBlockComponent {...props} />}
</BlockTree>
```

---

## 17. Suggestions for Improvement

### Architecture & Design

1. **Consolidate the dual API**: The Legacy `BlockTree` wraps `AdvancedBlockTree` with a thin adapter. Consider whether the legacy API adds enough value to maintain, or if it should be deprecated. The indirection can be confusing for new contributors.

2. **Extract drag handle detection**: Currently, drag handles are detected by querying `[data-drag-handle]` inside `pointerdown`. This DOM traversal is fragile. Consider a context-based approach where drag handles register themselves via a SolidJS context/primitive.

3. **`findParent()` is O(n)**: The `VirtualTree.findParent(id)` method does a linear scan of the entire `_childMap`. For large trees, consider maintaining a reverse lookup `Map<ItemId, ItemId>` (child → parent) built during tree construction.

4. **Generator-based animation is clever but fragile**: The `createAnimations` generator relies on precise timing of yields and SolidJS effect scheduling. Consider documenting the invariants more explicitly, or replacing with a more explicit state machine.

### Code Quality

5. **Test helper duplication**: The `TestBlock`, `block()`, `group()`, and `buildTree()` helpers are copy-pasted across 4 test files. Extract into a shared `test/helpers.ts`.

6. **Missing `createBlockTree` tests**: The convenience helper in `createBlockTree.ts` has zero test coverage. Its tree manipulation logic (`findBlock`, `removeBlocks`, `insertBlocks`) duplicates logic that the consumer app also has to implement.

7. **Inconsistent import paths**: Some files use `'src/events'` while others use `'../events'`. The `src` alias works via tsconfig paths and vitest alias, but relative imports would be more portable.

8. **`any` usage in playground**: The playground app casts extensively to `any` when using `BlockTree`. This suggests the Legacy API's generic inference could be improved.

9. **`findIndex.ts` is unused**: The `findIndex` utility in `util/findIndex.ts` doesn't appear to be imported by any source file. Consider removing it.

### Features & Robustness

10. **No accessibility (a11y)**: There's no ARIA tree role, no keyboard-based reordering (arrow keys), no screen reader announcements for drag operations. This is a significant gap for production use.

11. **Pointer capture**: The DnD system attaches `pointermove`/`pointerup` listeners to `document` rather than using `setPointerCapture()`. Pointer capture would be more robust (no lost events if pointer leaves the window).

12. **Limited touch affordances**: Touch has long-press-to-drag, but no haptic feedback hooks, and touch users can't range-select since there's no shift key.

13. **Wrap layout measurement dependency**: The wrap layout in `calculateLayout` relies on actual DOM measurements (`container.x`, `container.y`) rather than computing positions mathematically. This means layout calculation isn't pure for wrap mode — it requires a rendered DOM. This prevents server-side rendering of wrap layouts.

### Performance

14. **`normaliseSelection` walks the full tree**: For every selection change, it traverses all tree nodes. For trees with hundreds of blocks, this could be optimized with an index.

15. **`measureBlocks` queries all elements**: `querySelectorAll('.solidnest-block')` on every measurement pass could be expensive for large trees. Consider maintaining a pre-built measurement cache that invalidates on tree changes.

16. **No virtualization**: All blocks are rendered in the DOM. For trees with thousands of items, a virtualized rendering approach would be necessary.

### Developer Experience

17. **No JSDoc on most internal functions**: Functions like `calculateLayout`, `measureBlocks`, `createAnimations` lack JSDoc comments explaining their contracts, especially edge cases.

18. **No TypeScript strict null checks in some paths**: The code uses `!` (non-null assertions) frequently when accessing element maps and measurements. Consider `Map.get()` + explicit null checks for safer code.

19. **Consider publishing as a proper npm package**: Currently `"private": true` with `"main"` pointing to raw `.tsx` source. For external consumption, a build step producing `.js` + `.d.ts` would be needed.
