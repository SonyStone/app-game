# solid-dnd — Implementation Plan

> A composable drag-and-drop library for SolidJS, built as LEGO-like primitives.

## Design Principles

1. **Primitives first** — Every feature is a SolidJS primitive (`createXxx`) that works independently
2. **Compose, don't configure** — Complex behavior emerges from combining simple primitives, not from giant config objects
3. **Flat composition** — Primitives are freely combinable at the same level, not nested inside wrapper primitives. Consumers compose them directly in their component.
4. **Utilities for glue** — Common patterns (reorder logic, click-vs-drag) live as small utilities or callbacks inside existing primitives, not as separate orchestration layers
5. **Test before integrate** — Each primitive gets thorough unit tests before being composed into components
6. **Incremental playground** — Every milestone adds a working demo to the playground

---

## Milestone Overview

```
M1  createDragSensor        ← pointer tracking, threshold detection
M2  createSortable          ← ordered list, insertion points, reorder
M3  createFlip              ← FLIP animation for layout transitions
M4  createSelection         ← multi-select (set, toggle, range)
M5  createNestable          ← nested containers, tag constraints
M6  Grid layout support     ← grid insertion points, grid selection
M7  createAutoScroll        ← scroll container edges during drag
M8  SortableList component  ← composed "batteries included" component
M9  Virtualization          ← optional virtual rendering for large lists
M10 Accessibility           ← keyboard DnD, ARIA roles, announcements
```

Each milestone builds on the previous. By M4, you have a fully functional sortable list with multi-select and animations. By M6, grid works. M8 wraps it all into a single component.

---

## M1 — `createDragSensor`

**Goal:** A primitive that detects drag gestures and tracks pointer movement.

### What it does

- Listens for `pointerdown` on a target element
- Waits until the pointer moves past a configurable threshold
- Emits drag start / drag move / drag end events
- Uses `setPointerCapture` for reliable tracking (no document listeners)
- Handles pointer cancel gracefully

### API Design

```typescript
type DragSensorOptions = {
  /** Pixels the pointer must move before drag is detected. Default: 8 */
  threshold?: number;
  /** Called when drag starts (threshold exceeded). */
  onDragStart?: (event: DragStartEvent) => void;
  /** Called on every pointer move during drag. */
  onDragMove?: (event: DragMoveEvent) => void;
  /** Called when pointer is released. */
  onDragEnd?: (event: DragEndEvent) => void;
  /** Called when drag is cancelled (pointer cancel, Escape key). */
  onDragCancel?: () => void;
};

type DragStartEvent = {
  /** The pointer position at drag start (where threshold was exceeded). */
  position: Vec2;
  /** The pointer position at the initial pointerdown. */
  origin: Vec2;
  /** The original PointerEvent. */
  pointerEvent: PointerEvent;
};

type DragMoveEvent = {
  /** Current pointer position. */
  position: Vec2;
  /** Delta from drag start position. */
  delta: Vec2;
};

type DragEndEvent = {
  /** Final pointer position. */
  position: Vec2;
  /** Total delta from drag start. */
  delta: Vec2;
};

function createDragSensor(options: DragSensorOptions): {
  /** Whether a drag is currently in progress. */
  isDragging: Accessor<boolean>;
  /** Current pointer position during drag, or null. */
  position: Accessor<Vec2 | null>;
  /** Delta from drag start, or null. */
  delta: Accessor<Vec2 | null>;
  /** Bind this to a pointerdown handler to start tracking. */
  onPointerDown: (ev: PointerEvent) => void;
  /** Programmatically cancel the current drag. */
  cancel: () => void;
};
```

### Files to create

```
src/primitives/createDragSensor.ts
test/primitives/createDragSensor.test.ts
```

### Tests

- Pointer down + move below threshold → no drag started
- Pointer down + move past threshold → `onDragStart` fires
- Move events fire `onDragMove` with correct delta
- Pointer up fires `onDragEnd`
- Escape key fires `onDragCancel`
- Right-click / non-primary button is ignored
- Multiple rapid pointer downs don't create multiple drags

### Playground

- Add a draggable box that follows the pointer
- Show drag state, position, delta as debug info

---

## M2 — `createSortable`

**Goal:** A primitive that manages a sortable list — computes insertion points, determines where a dragged item should drop.

### What it does

- Takes an ordered list of item keys + their measured rects
- Given a pointer position, computes the best insertion point
- Returns the `Place<K>` where the item would be inserted
- Pure computation — doesn't touch the DOM, doesn't do the actual reorder

### API Design

```typescript
type SortableOptions<K> = {
  /** The key of the container. */
  containerKey: K;
  /** Accessor returning the ordered list of item keys. */
  items: Accessor<K[]>;
  /** Returns the bounding rect for an item. */
  getRect: (key: K) => Rect | undefined;
  /** Returns the bounding rect for the container. */
  getContainerRect: () => Rect | undefined;
  /** Layout mode for insertion point calculation. */
  layout?: LayoutMode;
  /** Spacing between items in pixels. */
  spacing?: number;
};

function createSortable<K>(options: SortableOptions<K>): {
  /**
   * Given a pointer position, returns the best insertion point.
   * Call this during drag move to find where the item would drop.
   */
  getInsertionPoint: (position: Vec2) => Place<K> | undefined;
  /**
   * All valid insertion points (useful for rendering drop indicators).
   */
  insertionPoints: Accessor<Place<K>[]>;
};
```

### Files to create

```
src/primitives/createSortable.ts
test/primitives/createSortable.test.ts
```

### Tests

- List with 3 items → pointer above first item → `{ before: items[0] }`
- List with 3 items → pointer between items 1 and 2 → `{ before: items[1] }`
- List with 3 items → pointer below last item → `{ before: null }` (append)
- Pointer outside container horizontal bounds → returns undefined
- Empty list → returns `{ before: null }`
- Single item list → returns correct point above/below

### Playground

- Wire `createDragSensor` + `createSortable` together
- Highlight the drop position while dragging
- On drop, actually reorder the list (using a SolidJS store)
- Show "Reorder: [keys] → Place" in debug info

---

## M3 — `createFlip`

**Goal:** A primitive that animates layout transitions using the FLIP technique.

### What it does

- Before a DOM change: captures current element positions ("First")
- After the change: captures new positions ("Last")
- Computes inverse transforms and animates ("Invert" → "Play")
- Uses CSS transitions (not Web Animations API, for simplicity)

### API Design

```typescript
type FlipOptions = {
  /** Duration of the animation in milliseconds. Default: 200 */
  duration?: number;
  /** Easing function. */
  easing?: string;
  /** Map of item keys to their DOM elements. */
  elements: Map<string, HTMLElement>;
};

function createFlip(options: FlipOptions): {
  /** Call before the DOM change to capture current positions. */
  captureFirst: () => void;
  /** Call after the DOM change. Captures "Last" and plays the animation. */
  playFromFirst: () => void;
  /**
   * Whether an animation is currently playing.
   * Useful for disabling interactions during animation.
   */
  isAnimating: Accessor<boolean>;
};
```

### Alternative: auto-tracking API

```typescript
/**
 * Wraps a reactive tree and automatically FLIP-animates when it changes.
 * This is the "magic" version — just provide the element refs
 * and it handles the rest.
 */
function createAutoFlip<T>(
  /** The reactive data that drives the layout. */
  source: Accessor<T>,
  /** Map of item keys to their DOM elements. */
  elements: Map<string, HTMLElement>,
  options?: { duration?: number; easing?: string }
): {
  /** The current value (may be delayed during animation). */
  value: Accessor<T>;
  isAnimating: Accessor<boolean>;
};
```

### Files to create

```
src/primitives/createFlip.ts
src/primitives/flipUtils.ts          — measure, calculateDeltas, applyStyles
test/primitives/createFlip.test.ts
```

### Tests

- Element moves 100px down → transform starts at `translateY(-100px)` → transitions to `translateY(0)`
- Element resizes → width transition is applied
- New element entering → no inverse transform (it just appears)
- Removed element → (for now: instant removal; later: exit animation)
- Rapid consecutive changes → previous animation is interrupted cleanly

### Playground

- Reorderable list from M2, now with smooth FLIP animations
- Toggle animation on/off
- Adjustable duration slider

---

## M4 — `createSelection`

**Goal:** A primitive for multi-select in a list of items.

### What it does

- Manages a selection state (set of selected keys)
- Supports three modes: Set, Toggle, Range
- Detects modifier keys to choose mode
- Normalizes selection (removes children of selected parents, when nesting is added later)

### API Design

```typescript
type SelectionOptions<K> = {
  /** The ordered list of selectable items. */
  items: Accessor<K[]>;
  /** Whether multi-selection is enabled. Default: true */
  multiselect?: boolean;
  /** Called when selection changes. */
  onSelectionChange?: (keys: K[]) => void;
};

type SelectionMode = 'set' | 'toggle' | 'range';

function createSelection<K>(options: SelectionOptions<K>): {
  /** The currently selected keys, in selection order. */
  selected: Accessor<K[]>;
  /** Whether a specific key is selected. */
  isSelected: (key: K) => boolean;
  /** Handle a click on an item. Reads modifier keys to determine mode. */
  handleClick: (key: K, ev: PointerEvent) => void;
  /** Handle click/drag disambiguation for already-selected items. */
  handlePointerDown: (key: K, ev: PointerEvent) => void;
  /** Select specific keys programmatically. */
  select: (keys: K[]) => void;
  /** Clear the selection. */
  clear: () => void;
  /** Get the selection mode from a pointer event. */
  getMode: (ev: PointerEvent) => SelectionMode;
};
```

### Files to create

```
src/primitives/createSelection.ts
src/core/selectionModes.ts           — pure functions for set/toggle/range logic
test/primitives/createSelection.test.ts
test/core/selectionModes.test.ts
```

### Tests

- **Set mode**: Click item → selected. Click another → replaces.
- **Toggle mode**: Ctrl+click adds. Ctrl+click again removes.
- **Range mode**: Shift+click selects from first to target.
- Range with reversed direction works.
- Multiselect disabled → always Set mode regardless of modifiers.
- Click already-selected item → onClick deferred (for drag disambiguation).

### Playground

- List items now have selected/unselected visual state
- Selection info panel showing currently selected items
- Selection mode indicator
- Ctrl+click and Shift+click work
- Drag selected items (multiple) together

---

## M5 — `createNestable`

**Goal:** Support nested containers — items can contain other items, and you can drag between levels.

### What it does

- Manages a tree of containers, each with its own ordered list of items
- Each container has `accepts` tags that constrain what can be dropped in
- Computes insertion points across ALL containers in the tree
- Finds the best insertion point considering nesting depth

### API Design

```typescript
type NestableContainer<K> = {
  key: K;
  items: Accessor<K[]>;
  accepts?: string[];
  layout?: LayoutMode;
  spacing?: number;
  getRect: (key: K) => Rect | undefined;
  getContainerRect: () => Rect | undefined;
};

type NestableOptions<K> = {
  /** All containers in the tree, keyed by their key. */
  containers: Accessor<NestableContainer<K>[]>;
  /** Tag of the item(s) being dragged. */
  dragTags?: string[];
};

function createNestable<K>(options: NestableOptions<K>): {
  /** Best insertion point across all containers for a given position. */
  getInsertionPoint: (position: Vec2) => Place<K> | undefined;
};
```

### Files to create

```
src/primitives/createNestable.ts
src/core/tagConstraints.ts
test/primitives/createNestable.test.ts
test/core/tagConstraints.test.ts
```

### Tests

- Item dragged over root container → inserts into root
- Item dragged over nested container that accepts its tag → inserts into nested
- Item dragged over nested container that rejects its tag → falls back to parent
- Dragging a parent into its own child → rejected (circular)
- Multiple nesting levels → correct container selected by depth

### Playground

- Nested list demo becomes interactive
- Groups that accept items, items that can be dragged between groups
- Visual indicator showing which container is the drop target

---

## M6 — Grid Layout

**Goal:** Grid insertion points and grid-aware selection.

### What it does

- Computes insertion points for CSS Grid and flex-wrap layouts
- 2D insertion: row + column awareness
- Grid range selection (rectangular selection with Shift+click)

### API Design

Extensions to existing primitives:

```typescript
// createSortable gets layout: 'grid' support
// Grid-specific options:
type GridSortableOptions = SortableOptions & {
  layout: 'grid';
  columns: number; // or computed from container width
};

// createSelection gets grid range mode:
// Shift+click in a grid selects a rectangular region, not a linear range
```

### Files to create

```
src/core/gridLayout.ts               — grid position math
src/core/gridInsertion.ts            — grid insertion point algorithm
test/core/gridLayout.test.ts
test/core/gridInsertion.test.ts
```

### Tests

- 4-column grid, 8 items → pointer at row 1, col 2 → correct insertion
- Grid with variable column count (responsive) → recomputes
- Grid insertion at end of row → wraps to next row
- Grid range selection: click (0,0) then shift+click (2,2) → selects 3×3 block

### Playground

- Grid demo becomes interactive
- Drag items in grid, insertion indicator shows between cells
- Grid selection with visual highlight

---

## M7 — `createAutoScroll`

**Goal:** Automatically scroll containers when dragging near edges.

### What it does

- Monitors pointer position during drag relative to scrollable container edges
- Smoothly scrolls when pointer is within a threshold distance of an edge
- Speed increases as pointer gets closer to the edge

### API Design

```typescript
type AutoScrollOptions = {
  /** The scrollable container element. */
  container: Accessor<HTMLElement | undefined>;
  /** Whether auto-scroll is active (e.g., only during drag). */
  enabled: Accessor<boolean>;
  /** Distance from edge to start scrolling. Default: 50px */
  threshold?: number;
  /** Maximum scroll speed in px/frame. Default: 15 */
  maxSpeed?: number;
};

function createAutoScroll(options: AutoScrollOptions): {
  /** Update with current pointer position each frame. */
  update: (position: Vec2) => void;
};
```

### Files to create

```
src/primitives/createAutoScroll.ts
test/primitives/createAutoScroll.test.ts
```

### Tests

- Pointer near top edge → scrolls up
- Pointer near bottom edge → scrolls down
- Pointer far from edges → no scroll
- Speed increases as pointer approaches edge
- Disabled → no scrolling even when pointer is near edge

### Playground

- Long list (50+ items) in a scrollable container
- Auto-scrolls when dragging near top/bottom

---

## M8 — `SortableList` Component

**Goal:** A "batteries included" component that composes all primitives into a single easy-to-use component.

### What it does

- Composes: `createDragSensor` + `createSortable` + `createFlip` + `createSelection` + `createAutoScroll`
- Provides a simple props-based API (like solid-nest's `BlockTree`)
- Handles all the wiring internally
- Still allows escape hatches to the underlying primitives

### API Design

```typescript
type SortableListProps<K, T> = {
  /** The root container or items. */
  items: T[];
  /** Get the unique key of an item. */
  getKey: (item: T) => K;
  /** Current selection. */
  selection?: K[];
  onSelectionChange?: (keys: K[]) => void;
  /** Fired when items are reordered. */
  onReorder?: (event: { keys: K[]; place: Place<K> }) => void;
  /** Fired when items are removed (Delete key). */
  onRemove?: (event: { keys: K[] }) => void;
  /** Layout mode. */
  layout?: 'list' | 'grid';
  /** Animation duration. */
  transitionDuration?: number;
  /** Render function for each item. */
  children: (props: { item: T; selected: boolean; dragging: boolean }) => JSX.Element;
};

function SortableList<K, T>(props: SortableListProps<K, T>): JSX.Element;
```

### Files to create

```
src/components/SortableList.tsx
src/components/DragOverlay.tsx
src/components/DropIndicator.tsx
test/components/SortableList.test.tsx
```

### Playground

- Replace the raw demo with `SortableList` usage
- Side-by-side: "Primitives" tab (manual wiring) vs "Component" tab (SortableList)

---

## M9 — Virtualization (Optional)

**Goal:** Only render visible items for large lists.

### Approach

- Separate `VirtualSortableList` component
- Uses a virtual window that renders items in the visible range + buffer
- During drag: expands the window around the drop zone
- Layout model knows all positions; rendering is the only thing that's virtual

### Files

```
src/virtual/createVirtualWindow.ts
src/virtual/VirtualSortableList.tsx
```

---

## M10 — Accessibility (Nice-to-have)

### What it adds

- ARIA `role="listbox"` / `role="option"` (or `treeitem` for nested)
- Keyboard DnD: Space to grab, Arrow keys to move, Enter to drop, Escape to cancel
- Live region announcements: "Grabbed Item 3. Use arrow keys to move."
- Focus management: roving tabindex

### Files

```
src/a11y/announcements.ts
src/a11y/useKeyboardDrag.ts
src/a11y/LiveRegion.tsx
```

---

## Dependency Graph

```
M1  createDragSensor  ←──────────────────────────────────┐
    │                                                     │
M2  createSortable    ←── uses M1 in playground           │
    │                                                     │
M3  createFlip        ←── independent, composes with M2   │
    │                                                     │
M4  createSelection   ←── independent, composes with M1+M2│
    │                                                     │
M5  createNestable    ←── extends M2 concepts             │
    │                                                     │
M6  Grid layout       ←── extends M2 + M5                 │
    │                                                     │
M7  createAutoScroll  ←── composes with M1                │
    │                                                     │
M8  SortableList      ←── composes ALL of M1-M7           │
    │                                                     │
M9  Virtualization    ←── extends M8                       │
    │                                                     │
M10 Accessibility     ←── extends M8                       │
```

---

## Testing Strategy

| Primitive        | Test type                | DOM needed?                         |
| ---------------- | ------------------------ | ----------------------------------- |
| Core types       | Unit                     | No                                  |
| Selection modes  | Unit                     | No                                  |
| Grid layout math | Unit                     | No                                  |
| Tag constraints  | Unit                     | No                                  |
| createDragSensor | Unit + mock PointerEvent | jsdom                               |
| createSortable   | Unit with mock rects     | No                                  |
| createFlip       | Integration              | jsdom (needs getBoundingClientRect) |
| createSelection  | Unit + mock events       | Minimal                             |
| createNestable   | Unit with mock rects     | No                                  |
| createAutoScroll | Unit with mock scroll    | jsdom                               |
| SortableList     | Integration              | jsdom                               |
| Full E2E         | Playwright               | Real browser                        |

---

## File Structure (Final)

```
packages/solid-dnd/
├── src/
│   ├── index.ts                          # Public exports
│   ├── core/
│   │   ├── types.ts                      # Vec2, Rect, Place, ItemId, etc.
│   │   ├── selectionModes.ts             # Pure set/toggle/range logic
│   │   ├── tagConstraints.ts             # Tag-based accept/reject
│   │   ├── gridLayout.ts                 # Grid position math
│   │   └── gridInsertion.ts              # Grid insertion point algorithm
│   ├── primitives/
│   │   ├── createDragSensor.ts           # M1: Pointer tracking
│   │   ├── createSortable.ts             # M2: Insertion point calculation
│   │   ├── createFlip.ts                 # M3: FLIP animation
│   │   ├── createSelection.ts            # M4: Multi-selection
│   │   ├── createNestable.ts             # M5: Nested containers
│   │   └── createAutoScroll.ts           # M7: Edge scrolling
│   ├── components/
│   │   ├── SortableList.tsx              # M8: Batteries-included component
│   │   ├── DragOverlay.tsx               # Drag ghost
│   │   └── DropIndicator.tsx             # Drop position indicator
│   ├── virtual/                          # M9: Virtualization
│   │   ├── createVirtualWindow.ts
│   │   └── VirtualSortableList.tsx
│   └── a11y/                             # M10: Accessibility
│       ├── announcements.ts
│       ├── useKeyboardDrag.ts
│       └── LiveRegion.tsx
├── test/
│   ├── setup.ts
│   ├── core/
│   │   ├── types.test.ts
│   │   ├── selectionModes.test.ts
│   │   ├── tagConstraints.test.ts
│   │   ├── gridLayout.test.ts
│   │   └── gridInsertion.test.ts
│   ├── primitives/
│   │   ├── createDragSensor.test.ts
│   │   ├── createSortable.test.ts
│   │   ├── createFlip.test.ts
│   │   ├── createSelection.test.ts
│   │   ├── createNestable.test.ts
│   │   └── createAutoScroll.test.ts
│   └── components/
│       └── SortableList.test.tsx
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── PLAN.md                               # This file
```

---

## What to Build First

**Start with M1 (`createDragSensor`)** because:

1. It's the foundation everything else depends on
2. It's self-contained — no dependencies on other primitives
3. It's small enough to build and test thoroughly in one session
4. The playground demo (a draggable box) gives immediate visual feedback

Then M2 (`createSortable`) because:

1. Combined with M1, you get a working sortable list — the core value proposition
2. The insertion point math is pure computation — easy to test
3. The playground demo is immediately satisfying

Then M3 (`createFlip`) because:

1. Without animation, the reordering feels janky
2. This is what makes it "feel" like a real DnD library
3. It's independent — can be tested and developed in parallel with M4

---

## Current Status

- [x] Project scaffolding (package.json, tsconfig, vitest)
- [x] Core types (Vec2, Rect, Place, ItemId)
- [x] Playground app with static demos
- [x] **M1 — createDragSensor** ✅ 27 tests passing
- [x] **M2 — createSortable** ✅ 32 tests passing
- [x] **M3 — createFlip** ✅ 29 tests passing (13 flipUtils + 16 createFlip)
- [x] **M4 — createSelection** ✅ 61 tests passing (26 selectionModes + 35 createSelection)
- [x] **M5 — createNestable** ✅ 33 tests passing (11 tagConstraints + 22 createNestable)
- [x] **M6 — Grid layout** ✅ 63 tests passing (34 gridLayout + 20 gridInsertion + 9 applyGridRange)
- [ ] M7 — createAutoScroll
- [ ] M8 — SortableList component
- [ ] M9 — Virtualization
- [ ] M10 — Accessibility
