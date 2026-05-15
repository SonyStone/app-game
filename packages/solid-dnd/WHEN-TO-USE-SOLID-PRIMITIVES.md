# @solid-primitives — Usage Guide for solid-dnd

> Which `@solid-primitives` packages to adopt, when, and why some were intentionally skipped.

## Considered and Skipped — `@solid-primitives/utils`

### `Position` / `Size` types

**What:** `Position = { x: number; y: number }`, `Size = { width: number; height: number }`.

**Why skipped:** Our `Vec2` type is structurally identical to `Position`, and `Rect` covers `Size`. But `Vec2` and `Rect` are namespace modules (`Vec2.of()`, `Vec2.Zero`, `Rect.fromElement()`) — the namespace pattern gives us factory functions and constants alongside the type. Importing `Position` from utils would add a confusing alias for the same shape.

### Immutable array helpers (`remove`, `splice`, `push`, `filterOut`, etc.)

**What:** Pure array operations from `@solid-primitives/utils/immutable`.

**Why skipped:** We have immutable array patterns in `selectionModes.ts` (`[...arr.slice(0, idx), ...arr.slice(idx + 1)]`), `reorder.ts` (`[...without.slice(0, idx), ...moved, ...without.slice(idx)]`), and `tree.ts` (`filter`, `splice` on copies). These are 1–2 liners that are immediately readable. Adding `import { remove, splice } from '@solid-primitives/utils/immutable'` for a single call site each doesn't improve clarity — it trades one well-known pattern for an import the reader must look up. Reconsider if immutable array logic grows more complex (e.g., batch reorder of multiple items across containers).

### `tryOnCleanup`

**What:** `onCleanup` that no-ops outside a reactive owner.

**Why skipped:** Our primitives (`createDragSensor`, `createFlip`, etc.) are always called inside a component or reactive root. There's no code path where `onCleanup` would fire outside an owner. Using `tryOnCleanup` would mask bugs if someone accidentally calls a primitive outside a root.

### `handleDiffArray`

**What:** Diff two arrays, call `onAdded`/`onRemoved` for differences.

**Why skipped:** Our arrays (items, selected, draggedIds) are replaced wholesale via signal setters. We never incrementally diff them — SolidJS's `<For>` handles DOM diffing internally. No consumer code needs add/remove callbacks.

### `createCallbackStack`

**What:** Push/execute/clear pattern for callback lists.

**Why skipped:** The Escape key handler in `createDragSensor` uses a single cleanup function (`escapeCleanup`), not a stack. The pattern is simple enough that abstracting it adds indirection without benefit.

### `createHydratableSignal`

**What:** Signal with different initial value during SSR.

**Why skipped:** DnD is inherently client-only (pointer events, DOM measurement). No SSR hydration scenarios exist.

### `createMicrotask`

**What:** Deduplicated microtask scheduling.

**Why skipped:** We don't have any "coalesce multiple synchronous calls into one microtask" pattern. Drag move events are already naturally throttled by pointer event frequency.

### `arrayEquals`

**What:** Shallow array equality by length + `===` per element.

**Why skipped:** Our equality needs are structural (`Place.equals` for `{ parent, before }` objects) or reference-based (SolidJS signal default). No array-to-array comparison exists in the codebase.

### `EQUALS_FALSE_OPTIONS`

**What:** `{ equals: false }` signal options.

**Why skipped:** All our signals use either default equality or custom `Place.equals`. We never force-fire on every set.

### `chain` / `reverseChain`

**What:** Compose multiple functions into one.

**Why skipped:** Our callback options (`onDragStart`, `onDrop`, etc.) are single functions, not chains. No composition pattern needed.

### String transforms (`json`, `lines`, `pipe`, etc.)

**What:** String parsing utilities.

**Why skipped:** No string parsing in DnD. Our data types are all typed objects and arrays.

---

## Adopt at Specific Milestones

### M5 — `createNestable`

#### `@solid-primitives/resize-observer`

**What:** `createResizeObserver`, `createWindowSize`, `createElementSize`

**Why:** Nested containers may resize (accordion expand, sidebar toggle). Cached bounding rects become stale. Use `createResizeObserver` to invalidate rect caches when container dimensions change.

```ts
import { createResizeObserver } from '@solid-primitives/resize-observer';

createResizeObserver(containerEl, (entry) => {
  invalidateRects(containerKey);
});
```

### M7 — `createAutoScroll`

#### `@solid-primitives/scroll`

**What:** `createScrollPosition`, `useWindowScrollPosition`

**Why:** Auto-scroll needs to know current scroll offset to compute pointer-relative-to-container positions. `createScrollPosition` provides a reactive `{ x, y }` signal that updates on scroll.

```ts
import { createScrollPosition } from '@solid-primitives/scroll';

const scroll = createScrollPosition(containerEl);
// scroll.x, scroll.y are reactive
```

### M8 — `SortableList` Component

#### `@solid-primitives/context`

**What:** `createContextProvider`, `MultiProvider`

**Why:** The `SortableList` component needs to pass DnD state (drag sensor, selection, sortable) to child `SortableItem` components without prop drilling. `createContextProvider` provides better type inference than raw `createContext`.

```ts
import { createContextProvider } from '@solid-primitives/context';

const [SortableProvider, useSortable] = createContextProvider((props) => {
  const sensor = createDragSensor({ ... });
  const selection = createSelection({ ... });
  return { sensor, selection, ... };
});
```

#### `@solid-primitives/refs`

**What:** `mergeRefs`, `resolveElements`, `resolveFirst`

**Why:** `SortableList` needs a ref to each item's DOM element for measuring rects. But consumers may also want their own ref. `mergeRefs` composes multiple ref callbacks.

```tsx
import { mergeRefs } from '@solid-primitives/refs';

// Inside SortableItem:
<div ref={mergeRefs(props.ref, (el) => itemRefs.set(key, el))} />;
```

### M10 — Accessibility

#### `@solid-primitives/keyboard`

**What:** `useKeyDownList`, `useCurrentlyHeldKey`, `createKeyHold`, `createShortcut`

**Why:** Keyboard-driven DnD needs: Space to grab, Arrow keys to move, Enter to drop, Escape to cancel. `createShortcut` registers key combos with auto-cleanup. `useCurrentlyHeldKey` helps detect modifier state for copy-vs-move.

```ts
import { createShortcut } from '@solid-primitives/keyboard';

createShortcut(['Space'], () => toggleGrab());
createShortcut(['ArrowDown'], () => moveDown());
createShortcut(['Escape'], () => cancelDrag());
```

#### `@solid-primitives/active-element`

**What:** `createActiveElement`, `createFocusSignal`

**Why:** Keyboard DnD requires roving tabindex and focus management. `createActiveElement` tracks which element has focus reactively, useful for knowing which item receives keyboard commands.

---

## Considered and Intentionally Skipped

### `@solid-primitives/set` / `@solid-primitives/map`

**What:** `ReactiveSet`, `ReactiveMap` — Reactive data structures with per-key granular tracking.

**Why skipped:** Our usage patterns are bulk-replace, not per-key:

- `draggedIds` — set all-at-once on drag start, cleared all-at-once on end. Never add/remove individually.
- `selected` in `createSelection` — replaced as a whole array on every click. The derived `selectedSet` is a `createMemo(() => new Set(...))` which is already optimal.
- `itemRefs` (`new Map<string, HTMLElement>`) — written in JSX `ref={}` callbacks, read inside event handlers. No SolidJS reactivity needed; reads happen outside tracked computations.

`ReactiveSet`/`ReactiveMap` add per-mutation signal overhead that would be wasted on our patterns. Use them only if a future feature needs "react when item X is added/removed from the set."

### `@solid-primitives/state-machine`

**What:** `createMachine` — Finite state machine primitive.

**Why skipped:** Our drag sensor is a 3-state machine (`idle → tracking → dragging`) implemented with two booleans. The formal FSM primitive adds abstraction without benefit at this scale. Reconsider if the state space grows significantly (e.g., adding `animating`, `auto-scrolling`, `keyboard-dragging` states).

### `@solid-primitives/spring` / `@solid-primitives/tween`

**What:** Spring physics interpolation / numeric tweening.

**Why skipped:** Our FLIP animations use the Web Animations API, which runs on the compositor thread (GPU-accelerated, doesn't block JS). Springs and tweens run in JS on the main thread at 60fps via `requestAnimationFrame`, which is strictly worse for layout animations. Could be useful for a future drag overlay "snap-back" effect, but not for list reordering.

### `@solid-primitives/static-store`

**What:** `createStaticStore` — Lightweight reactive objects with static keys (no Proxy).

**Why skipped:** Our `Vec2` is an immutable `{ x, y }` value type. We intentionally create a new object per frame (`Vec2.of(x, y)`) so that SolidJS signal comparison detects changes. Wrapping it in a mutable store would fight this design. `createSignal<Vec2>` is the right choice.

### `@solid-primitives/bounds`

**What:** `createElementBounds` — Reactive element bounds tracking via ResizeObserver + scroll + MutationObserver.

**Why skipped:** This is "always-on" tracking — it watches every scroll/resize/mutation to keep bounds fresh. Our `getRect()` approach measures on-demand during drag, which is much cheaper. We only need rects during the ~500ms of an active drag, not 100% of the time. Use `resize-observer` (above) only for invalidation, not continuous tracking.

### `@solid-primitives/pointer`

**What:** `createPointerListeners`, `createPerPointerListeners`, `createPointerPosition`

**Why skipped:** Our `createDragSensor` already handles pointer events directly with `setPointerCapture` — a more specialized pattern than what this package provides. The pointer primitive is designed for "track all active pointers on screen" which is broader than we need.

### `@solid-primitives/transition-group`

**What:** `createListTransition`, `createSwitchTransition`

**Why skipped:** `createListTransition` animates enter/exit of list items, but our reorder animation is a FLIP (same elements, new positions). The transition-group approach would require removing and re-adding elements, which is a different paradigm. Our `createFlip` is more appropriate for same-element positional animation.

### `@solid-primitives/event-bus`

**What:** `createEventBus`, `createEmitter`, `createEventHub`

**Why skipped:** Our primitives use direct callback options (`onDragStart`, `onSelectionChange`, etc.) which is simpler and more type-safe than a pubsub pattern. The callback pattern also composes better with SolidJS's ownership model (auto-cleanup). Reconsider if cross-component DnD events become complex.

### `@solid-primitives/mutation-observer`

**What:** `createMutationObserver`

**Why skipped:** We don't need to watch for external DOM mutations. Our items are controlled by SolidJS signals — when items change, we know because we changed them. MutationObserver would be needed if external code modified the DOM behind our back.
