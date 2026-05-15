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
│  Immutable tree    │◄──────►│  Drag state machine      │
│  data structure    │        │  Insertion point calc    │
└────────┬───────────┘        └──────────┬───────────────┘
         │                               │
         ▼                               ▼
┌────────────────────┐        ┌──────────────────────────┐
│  calculateLayout() │        │  getInsertionPoints()    │
│  Y-position math   │        │  Valid drop targets      │
└────────────────────┘        └──────────────────────────┘
         │
         ▼
┌────────────────────┐        ┌──────────────────────────┐
│ createAnimations() │        │  selection.ts            │
│ FLIP engine        │◄──────►│  Multi-select logic      │
└────────────────────┘        └──────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│                     DOM Output                         │
│  Nested divs with inline transition styles             │
│  + drag ghost overlay (position:fixed)                 │
└────────────────────────────────────────────────────────┘
```

### Data Flow Summary

1. **User data** (tree of blocks) → converted to a **VirtualTree** (internal immutable representation)
2. On drag start → VirtualTree is **modified** (blocks removed, dropzone inserted) → produces a new tree
3. New tree is fed to **createAnimations** → FLIP engine measures before/after DOM → applies transition styles
4. On drop → **ReorderEvent** fired to consumer → consumer updates their store → new VirtualTree created

---

## 3. Module Map

### Source Files (`src/`)

| File                             | Role                                                                                        | Lines |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ----- |
| **index.tsx**                    | Public entry point; re-exports everything                                                   | 6     |
| **BlockTree.tsx**                | Advanced API component (the real renderer)                                                  | ~465  |
| **LegacyBlockTree.tsx**          | Legacy/simple API component (wraps Advanced)                                                | ~105  |
| **createBlockTree.ts**           | Convenience store helper (quick-start utility)                                              | ~130  |
| **virtual-tree.ts**              | `VirtualTree` class — immutable tree data structure                                         | ~210  |
| **Item.ts**                      | Item types (`BlockItem`, `ContainerItem`, `PlaceholderItem`, `GapItem`) + factory functions | ~90   |
| **events.ts**                    | Event types (`ReorderEvent`, `SelectionEvent`, etc.)                                        | ~80   |
| **selection.ts**                 | Selection modes (Set/Toggle/Range), `updateSelection`, `normaliseSelection`                 | ~100  |
| **calculateLayout.ts**           | Pure function: VirtualTree + measurements → DOMRect map                                     | ~95   |
| **calculateTransitionStyles.ts** | FLIP: prev layout vs next layout → invert/play style maps                                   | ~175  |
| **createAnimations.ts**          | SolidJS effect that orchestrates the FLIP animation                                         | ~65   |
| **measure.ts**                   | DOM measurement: reads `getBoundingClientRect()` from element map                           | ~55   |
| **styles.ts**                    | CSS class names, CSS custom properties, stylesheet injection                                | ~40   |
| **dnd/createDnd.ts**             | Drag-and-drop state machine (pointer tracking, tree manipulation)                           | ~233  |
| **dnd/getInsertionPoints.ts**    | Computes all valid drop targets from a tree + measurements                                  | ~70   |
| **components/DragContainer.tsx** | Default drag ghost overlay component                                                        | ~30   |
| **components/Dropzone.tsx**      | Default dropzone indicator component                                                        | ~8    |
| **components/Placeholder.tsx**   | Default empty placeholder component                                                         | ~4    |
| **util/types.ts**                | `Vec2` type + namespace                                                                     | ~6    |
| **util/notNull.ts**              | Type guard `notNull<T>()`                                                                   | ~3    |
| **util/modifierKey.ts**          | Platform-aware Ctrl/Cmd detection                                                           | ~6    |
| **util/findIndex.ts**            | `findIndex` with start offset                                                               | ~8    |

### Test Files (`test/`)

| File                           | What it tests                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| **index.test.tsx**             | Basic instantiation of both BlockTree and AdvancedBlockTree                                 |
| **virtual-tree.test.ts**       | VirtualTree creation, findBlock, containsChild, removeBlocks, insertDropzone, extractBlocks |
| **calculateLayout.test.ts**    | Layout rect computation for flat lists, nested groups, wrap layouts                         |
| **getInsertionPoints.test.ts** | Valid insertion point calculation, tag filtering, nested containers                         |
| **selection.test.ts**          | Selection modes (Set/Toggle/Range), normaliseSelection                                      |
| **setup.ts**                   | Polyfill for `adoptedStyleSheets` in jsdom                                                  |

---

## 4. Core Data Model

### The Item Hierarchy

The system converts user-provided block data into a **flat typed item model**:

```
ContainerItem       — Represents a container that holds children
  ├── BlockItem     — Represents a user block (brush, group, etc.)
  │     └── ContainerItem (nested)  — Block's child container(s)
  │           └── BlockItem ...
  ├── PlaceholderItem — "Insert at end" sentinel (one per container)
  └── GapItem       — Dropzone indicator (inserted during drag)
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

type GapItem = {
  id: ItemId; // "gap"
  kind: 'gap';
  before: ItemId; // Inserted before this item
  height: number; // Height of the dropzone
};
```

#### ID Convention

| Prefix    | Meaning                                 |
| --------- | --------------------------------------- |
| `c-{key}` | Container item                          |
| `b-{key}` | Block item                              |
| `p-{key}` | Placeholder (end-of-container sentinel) |
| `gap`     | Dropzone (only one at a time)           |

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

> **Note**: The playground app does NOT use `createBlockTree` — it manages state manually with `createStore` + `produce`.

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

| Method                          | What it does                                                   |
| ------------------------------- | -------------------------------------------------------------- |
| `children(id)`                  | Get child items of a container or block                        |
| `findBlock(key)`                | Find the original user block by key                            |
| `findItemById(id)`              | Find any item by its ItemId                                    |
| `findParent(id)`                | Find the parent item id (linear scan)                          |
| `containsChild(item, other)`    | Recursive containment check                                    |
| `removeBlocks(keys)`            | Returns a **new** tree with blocks removed from child maps     |
| `removeItems(ids)`              | Lower-level: remove by ItemId                                  |
| `insertDropzone(place, height)` | Returns a **new** tree with a GapItem inserted                 |
| `extractBlocks(keys)`           | Returns a **new** tree with only specified blocks under root   |
| `levels()`                      | Iterator yielding `[ItemId, depth]` pairs (BFS-like via stack) |

### Immutability Pattern

The VirtualTree is immutable. Modifications return new instances that share the `_items` map but have modified `_childMap` copies. This is critical for the animation system, which needs to compare prev vs next tree states.

---

## 7. Drag & Drop Pipeline

### State Machine (`createDnd.ts`)

The DnD system is a SolidJS reactive pipeline:

```
                 pointerdown on [data-drag-handle]
                              │
                              ▼
                     clickedBlock signal set
                              │
                     pointermove listener attached
                              │
                   mouse moved > dragThreshold?
                         │           │
                        no          yes
                         │           │
                     (wait)    ┌─────▼──────────┐
                               │  dragState set  │
                               │  keys, topItem  │
                               │  offset, size   │
                               │  tags           │
                               └─────┬──────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                 ▼
           treeWithoutDragged  insertionPoints   dragPosition
           (blocks removed)    (valid targets)   (ghost pos)
                    │                │
                    ▼                ▼
              treeWithDropzone ← insertion (best match)
              (gap inserted)
                    │
                    ▼
              createAnimations → FLIP → DOM

                 pointerup
                    │
                    ▼
              onReorder event fired
              dragState cleared
```

### Insertion Point Algorithm (`getInsertionPoints.ts`)

1. Takes the tree (with dragged blocks already removed) and DOM measurements
2. Runs `calculateLayout()` to get positioned rects for every item
3. Walks the tree, checking which containers `accept` the dragged block's tags
4. For each valid position, creates an `InsertionPoint` with `{place, y, x?, width?, height?, inWrap?}`

### Best-Match Selection (in `createDnd.ts`)

The pointer position is compared against insertion points:

- **List mode**: Y-band matching — each point owns a vertical band from its Y up to halfway to the next point
- **Wrap mode**: 2D distance matching — finds the closest point by Euclidean distance
- When both exist, the closer match wins

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
- For **placeholders** and **gaps**: just advances `nextY` by their measured height

#### Usage

Called in two places:

1. **`getInsertionPoints`** — to determine Y positions of valid drop targets
2. **`calculateTransitionStyles`** — to compute FLIP deltas between tree states

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

Both `BlockTree` and `createDnd` share a `Map<ItemId, HTMLElement>` that is populated via `ref` callbacks in the render function. This is the bridge between the virtual tree and the real DOM.

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

- Drag state (what's being dragged, where the pointer is)
- Animation state (current FLIP phase)
- Computed trees (with dropzone inserted)

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

| Area                    | Test file                    | What's tested                                                                 |
| ----------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| Component instantiation | `index.test.tsx`             | Both APIs can render without error                                            |
| VirtualTree             | `virtual-tree.test.ts`       | create, findBlock, containsChild, removeBlocks, insertDropzone, extractBlocks |
| Layout                  | `calculateLayout.test.ts`    | Flat list, spacing, empty tree, wrap layout placeholders                      |
| Insertion points        | `getInsertionPoints.test.ts` | Tag filtering, nested containers, wrap layout, Y ordering                     |
| Selection               | `selection.test.ts`          | All three modes, normaliseSelection                                           |

### What's NOT Tested

- The actual DnD flow (no DOM interaction tests in unit tests — covered by Playwright e2e in the playground app)
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
    setRoot(produce((draft) => {
      removeBlocks(draft, event.keys, blocks);
      insertBlocks(draft, blocks, event.place);
    }));
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

4. **Single dropzone limitation**: Only one `GapItem` (with id `"gap"`) can exist at a time. This is fine for single-pointer DnD but would need rework for multi-touch or collaborative scenarios.

5. **Generator-based animation is clever but fragile**: The `createAnimations` generator relies on precise timing of yields and SolidJS effect scheduling. Consider documenting the invariants more explicitly, or replacing with a more explicit state machine.

### Code Quality

6. **Test helper duplication**: The `TestBlock`, `block()`, `group()`, and `buildTree()` helpers are copy-pasted across 4 test files. Extract into a shared `test/helpers.ts`.

7. **Missing `createBlockTree` tests**: The convenience helper in `createBlockTree.ts` has zero test coverage. Its tree manipulation logic (`findBlock`, `removeBlocks`, `insertBlocks`) duplicates logic that the consumer app also has to implement.

8. **Inconsistent import paths**: Some files use `'src/events'` while others use `'../events'`. The `src` alias works via tsconfig paths and vitest alias, but relative imports would be more portable.

9. **`any` usage in playground**: The playground app casts extensively to `any` when using `BlockTree`. This suggests the Legacy API's generic inference could be improved.

10. **`findIndex.ts` is unused**: The `findIndex` utility in `util/findIndex.ts` doesn't appear to be imported by any source file. Consider removing it.

### Features & Robustness

11. **No accessibility (a11y)**: There's no ARIA tree role, no keyboard-based reordering (arrow keys), no screen reader announcements for drag operations. This is a significant gap for production use.

12. **No scroll-during-drag**: When dragging near container edges, the container doesn't auto-scroll. This is essential for long lists.

13. **Pointer capture**: The DnD system attaches `pointermove`/`pointerup` listeners to `document` rather than using `setPointerCapture()`. Pointer capture would be more robust (no lost events if pointer leaves the window).

14. **No touch-specific affordances**: While `PointerEvent` is used (good!), there's no long-press-to-drag for touch, no haptic feedback hooks, and touch users can't range-select since there's no shift key.

15. **Wrap layout measurement dependency**: The wrap layout in `calculateLayout` relies on actual DOM measurements (`container.x`, `container.y`) rather than computing positions mathematically. This means layout calculation isn't pure for wrap mode — it requires a rendered DOM. This prevents server-side rendering of wrap layouts.

### Performance

16. **`normaliseSelection` walks the full tree**: For every selection change, it traverses all tree nodes. For trees with hundreds of blocks, this could be optimized with an index.

17. **`measureBlocks` queries all elements**: `querySelectorAll('.solidnest-block')` on every measurement pass could be expensive for large trees. Consider maintaining a pre-built measurement cache that invalidates on tree changes.

18. **No virtualization**: All blocks are rendered in the DOM. For trees with thousands of items, a virtualized rendering approach would be necessary.

### Developer Experience

19. **No JSDoc on most internal functions**: Functions like `calculateLayout`, `measureBlocks`, `createAnimations` lack JSDoc comments explaining their contracts, especially edge cases.

20. **No TypeScript strict null checks in some paths**: The code uses `!` (non-null assertions) frequently when accessing element maps and measurements. Consider `Map.get()` + explicit null checks for safer code.

21. **Consider publishing as a proper npm package**: Currently `"private": true` with `"main"` pointing to raw `.tsx` source. For external consumption, a build step producing `.js` + `.d.ts` would be needed.
