# Code Review: `solid-dnd` + `solid-dnd-playground`

> Reviewed: February 24, 2026

---

## Summary

Both projects are high quality. The library has clean architecture with rigorous separation of pure logic and reactive primitives. The playground is a thorough, self-contained demonstration app with progressive complexity. The codebase is consistent, well-documented, well-tested, and follows SolidJS idioms faithfully.

| Dimension        | Library    | Playground |
| ---------------- | ---------- | ---------- |
| Architecture     | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Code quality     | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐½  |
| TypeScript usage | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐½  |
| Test coverage    | ⭐⭐⭐⭐⭐ | N/A        |
| Documentation    | ⭐⭐⭐⭐⭐ | ⭐⭐⭐½    |
| DRY / reuse      | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐   |
| SolidJS idioms   | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Accessibility    | N/A        | ⭐⭐⭐     |
| Performance      | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐½  |

---

## Library — `solid-dnd`

> 21 source files · 12 core modules · 8 primitives · 422 tests across 19 test files

### Architecture

**Pure core / reactive shell** — Every file in `src/core/` is pure functions with zero framework dependencies. SolidJS reactivity is confined to `src/primitives/`. The dependency direction is strictly `primitives → core`, never the reverse. Core logic is trivially testable, portable to other frameworks, and easy to reason about.

**Type + Utility Module pattern** — The namespace-as-module pattern (`Rect.of()`, `Vec2.of()`, `Tree.move()`, `Place.equals()`, `Grid.resolveGrid()`) gives tree-shakeable exports, clean `import * as X` usage, function overloads, and self-documenting call sites.

**Shared algorithms** — The vertical center-line insertion algorithm lives in `core/listInsertion.ts` and is used by both `createSortable` (list mode) and `createNestable` (per-container). No duplication between the two primitives.

### Primitives

- **`createDragSensor`** — Pointer tracking with threshold detection. `setPointerCapture` transferred to a hidden proxy element so the source DOM node can be removed mid-drag. Escape key listener is scoped to active drag state only. `preventDefault()` is deferred until the threshold is exceeded, preserving focus and form interactions.

- **`createSortable`** — Insertion point computation for vertical lists and CSS grids. `gridConfig` accepts `Accessor<GridConfig>` for reactive column changes. Active items filtering uses `Set` for O(1) exclusion. Grid mode uses full-item-count geometry for stable cell dimensions during drag.

- **`createNestable`** — Multi-container sortable with tag constraints and cycle prevention. Container selection picks the deepest (smallest-area) valid target. `wouldCycle` has a visited-set guard against malformed parent chains. Delegates per-container insertion to the shared `getListInsertionPoint`.

- **`createFlip`** — FLIP animation via Web Animations API (compositor thread). Computes `dx`/`dy` translation and `scaleX`/`scaleY` for items that change size during reorder. Smart remaining-time calculation, `snapshotsEqual` no-op detection, `isConnected` guard for detached elements, `batch()` for atomic DOM updates. Uses a local variable for effective duration — never mutates caller's options.

- **`createSelection`** — Multi-select with set/toggle/range modes. Modifier key detection (`Ctrl`/`Meta` → toggle, `Shift` → range). Grid-aware rectangular range selection.

- **`createDropzone`** / **`createTreeDropzone`** — Display key computation with gap sentinel insertion. Separates "what to render" from "where to drop."

- **`createDragOverlay`** — Manages floating overlay position/size during drag.

### Core Modules

- **`listInsertion`** — Shared vertical center-line algorithm for list-mode insertion points.
- **`gridLayout`** / **`gridInsertion`** — Grid geometry resolution, cell↔index conversion, grid indicator positioning. `normalizeGap` is module-private.
- **`tree`** — Immutable tree operations. `Tree.move()` uses `parentMap` for O(1) parent lookup.
- **`place`** — The `Place<K>` type (`{ parent, before }` or `{ parent, before: null }`) with `equals` and `label` utilities.
- **`reorder`** — `reorderItems` accepts both `K[]` and `ReadonlySet<K>` for moved keys. Skips `new Set()` allocation when caller already passes a Set.
- **`tagConstraints`** — `accepts` and `wouldCycle` with cycle-safe visited-set guard.
- **`types`** — `GridConfig`, `LayoutMode`, `NestableContainer<K>`. `ItemId` branded type retained as a utility factory for consumers, not used internally.

### Test Suite

422 tests, all passing. ~97% function coverage across 19 test files:

- **Unit tests** — Every core module and every primitive has dedicated tests. Edge cases covered: empty lists, boundary positions, missing rects, cycle detection, degenerate grids.
- **Integration tests** — 7 tests composing `createSortable` + `createDropzone` + `createSelection` + `reorderItems` together.
- **Stress tests** — 12 tests for 1,000-item reorders, rapid-fire sequential moves, degenerate grid configurations, large tree operations, Set API paths.
- **SolidJS lifecycle** — Tests properly use `createRoot` with disposal for reactive primitive testing.

### Documentation

Nearly every function has JSDoc with `@example` blocks. ASCII art diagrams explain algorithms in both source and tests. `MARK:` comment sections organize files newspaper-style. The `Place` concept is explained once and used consistently.

---

## Playground — `solid-dnd-playground`

> 35 source files · 7 demos · 22 components · Vite + code-splitting

### Architecture

**Progressive demo complexity** — SensorDemo → ListDemo → GridDemo → ListOverlayDemo → GridOverlayDemo → NestedDemo → NestedOverlayDemo. Each demo builds on the previous concepts.

**Self-contained demos** — Each demo file is fully readable top-to-bottom without jumping to shared hooks. For a playground, discoverability over DRY is the right trade-off.

**Lazy loading** — All 7 demo routes use `lazy()` for code-splitting. Each demo is a separate chunk.

**Error boundaries** — `<ErrorBoundary>` wraps demo content with a styled fallback component, preventing one broken demo from crashing the page.

### Components

- **Shared `GHOST_CLASS`** — The dragged-item style is defined once in `components/styles.ts` and used by `ListItem`, `GridItem`, and `LeafItem`.
- **Composed `GridControls`** — Composes `AnimationControls` and adds the columns slider. No duplication.
- **`FlipDebugOverlay`** — Decomposed into `debug/gapTrail.ts` and `debug/elementTrails.ts` hooks. RAF-based position sampling with visual trail rendering, cycle markers, and copy-to-clipboard with proper `onCleanup`.
- **Memoized item lookup** — Overlay demos use `createMemo(() => new Map(...))` for O(1) `getItem()` instead of O(n) `items().find()`.
- **Stale ref cleanup** — `resetDragState` deletes `GAP_KEY` from `itemRefs` to prevent detached DOM node retention.

### Accessibility

ARIA attributes on all interactive elements:

- Containers: `role="listbox"` + `aria-label`
- Items: `role="option"` + `aria-selected` + `aria-roledescription="sortable item"`
- Groups: `role="option"` + `aria-roledescription="sortable group"`

Full keyboard DnD (Space to grab, arrow keys to move, Enter to drop) is deferred to M10.

### SolidJS Patterns

- `type` over `interface` consistently
- `PointerEvent` over `MouseEvent` throughout
- Proper signal/memo/effect usage, `batch()` for multi-signal updates
- `<For>` and `<Show>` consistently used
- `@solid-primitives/event-listener` for auto-cleaning event handlers
- `@solid-primitives/scheduled` for throttling
- `@solid-primitives/cursor` for body cursor management

---

## Remaining Opportunities

### Future Milestones

These are new features requiring dedicated API design, not fixes:

- **Grid support for `createNestable`** — Currently only vertical hit testing per container. Adding 2D grid insertion within nested containers requires new API surface.
- **Horizontal list layout mode** — `createSortable` supports vertical lists and grids. A horizontal mode would need a `getListInsertionPoint` variant using `centerX` instead of `centerY`.

### Nice-to-haves

- **`resolvedGrid` staleness** — The grid memo uses imperative DOM reads (`getContainerRect`, `getRect`) which aren't SolidJS-tracked signals. If the container resizes without item changes, grid calculations go stale. Could accept container dimensions as reactive accessors, or document as a known limitation.
- **Demo duplication** — ~85% structural similarity across overlay demos (signal setup, sensor config, selection, flip, throttle, resetDragState). Intentionally self-contained for discoverability. Could extract a `createSortableDemo()` hook if the demo count grows significantly.
- **Keyboard DnD** — Per PLAN.md M10: Space to grab, arrow keys to move, Enter to drop, Escape to cancel. `@solid-primitives/keyboard` identified for implementation.
- **Live region announcements** — Screen reader announcements for drag operations. Deferred to M10.
