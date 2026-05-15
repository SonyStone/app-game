# @solid-primitives — Ecosystem Reference

> Complete catalog of `@solid-primitives` packages for SolidJS projects.
> Use this document to find the right reactive primitive for any use case.

---

## Inputs

### `@solid-primitives/active-element`

Track which DOM element currently has focus. `createActiveElement` returns a reactive signal of the focused element. `createFocusSignal` returns a boolean for a specific element.

### `@solid-primitives/autofocus`

Automatically focus elements on mount. `autofocus` directive and `createAutofocus` primitive.

### `@solid-primitives/input-mask`

Input masking for text fields. `createInputMask` applies formatting patterns (phone numbers, dates, etc.) to input elements.

### `@solid-primitives/keyboard`

Reactive keyboard input. `useKeyDownList` tracks all currently held keys. `useCurrentlyHeldKey` returns a single key signal. `createKeyHold` detects long-press of a key. `createShortcut` registers key combos with auto-cleanup.

### `@solid-primitives/mouse`

Track mouse/touch cursor position reactively. `createMousePosition` for global position. `createPositionToElement` for position relative to a specific element. `getPositionInElement` for normalized 0–1 coordinates within an element.

### `@solid-primitives/pointer`

Unified pointer event handling (mouse + touch + pen). `createPointerListeners` attaches pointer event handlers. `createPerPointerListeners` tracks individual pointers from down→up. `createPointerPosition` for reactive pointer position. `pointerHover` directive for hover detection that works across input types.

### `@solid-primitives/scroll`

Reactive scroll position tracking. `createScrollPosition` returns `{ x, y }` for a scrollable element. `useWindowScrollPosition` for the window.

### `@solid-primitives/selection`

Track the current text selection in the document reactively. Not related to item/list selection — this is about `window.getSelection()`.

---

## Display & Media

### `@solid-primitives/bounds`

Reactive element bounds (position + size) on screen. `createElementBounds` auto-updates on scroll, resize, and DOM mutation. Supports throttling. Returns `{ top, left, right, bottom, width, height }`.

### `@solid-primitives/resize-observer`

Reactive ResizeObserver wrappers. `createResizeObserver` calls back when element dimensions change. `createWindowSize` and `createElementSize` return reactive `{ width, height }`.

### `@solid-primitives/intersection-observer`

Reactive IntersectionObserver wrappers. `createIntersectionObserver` tracks when elements enter/leave a root viewport. `createVisibilityObserver` returns a boolean signal per element.

### `@solid-primitives/media`

Reactive media queries and breakpoints. `createMediaQuery` returns a boolean signal for a query. `createBreakpoints` maps named breakpoints to reactive signals. `usePrefersDark` detects dark mode preference.

### `@solid-primitives/page-visibility`

Track whether the page/tab is visible or hidden. `createPageVisibility` returns a reactive signal.

### `@solid-primitives/idle`

Detect user idle state. `createIdleTimer` fires after configurable inactivity.

### `@solid-primitives/styles`

Track computed CSS values reactively. `createRemSize` returns the current `rem` size in pixels.

### `@solid-primitives/audio`

Reactive audio playback. `makeAudio`, `makeAudioPlayer`, `createAudio` for playing audio with reactive state (playing, currentTime, duration, etc.).

### `@solid-primitives/devices`

Access hardware devices. `createDevices` lists media devices. Also provides `createAccelerometer`, `createGyroscope` for sensor data.

### `@solid-primitives/filesystem`

File system access API wrappers. `createFileSystem` and variants for reading/writing files via the browser File System Access API.

---

## Browser APIs

### `@solid-primitives/event-listener`

Comprehensive reactive event listener management with automatic cleanup on component unmount.

- `createEventListener` — Reactive: re-attaches when target/event signal changes.
- `makeEventListener` — Non-reactive: attaches once, cleans up on dispose.
- `createEventSignal` — Returns a signal of the latest event.
- `createEventListenerMap` — Attach multiple events at once.
- `makeEventListenerStack` — Push/pop listeners.
- `WindowEventListener` / `DocumentEventListener` — JSX components for declarative listeners.
- `preventDefault`, `stopPropagation`, `stopImmediatePropagation` — Event modifier helpers.

### `@solid-primitives/event-props`

`createEventProps` — Create event handler props objects for composable component APIs. Useful when building wrapper components that need to forward event handlers.

### `@solid-primitives/mutation-observer`

Reactive MutationObserver wrapper. `createMutationObserver` watches for DOM changes (child additions, attribute changes, text content changes).

### `@solid-primitives/clipboard`

Clipboard read/write. `copyClipboard` for quick copy. `writeClipboard` for the async Clipboard API. `createClipboard` for reactive clipboard access.

### `@solid-primitives/fullscreen`

Fullscreen API wrapper. `createFullscreen` toggles fullscreen mode on an element with a reactive signal.

### `@solid-primitives/permission`

Track browser permissions reactively. `createPermission` returns a signal for a permission state (granted/denied/prompt).

### `@solid-primitives/storage`

Persistent reactive storage. `makePersisted` wraps any signal to sync with localStorage, sessionStorage, or cookies. `cookieStorage` adapter for cookie-based persistence. `storageSync` for cross-tab sync.

### `@solid-primitives/timer`

Reactive timer/interval primitives with auto-cleanup. `makeTimer` for one-shot or repeating timers. `createTimer` for reactive timer signals. `createPolled` for periodic polling. `createIntervalCounter` for incrementing counters.

### `@solid-primitives/upload`

File upload with drop zones. `createFileUploader` for file input handling. `createDropzone` for file drag-and-drop.

### `@solid-primitives/workers`

Web Worker primitives. `createWorker` for running code in a worker. `createWorkerPool` for parallel processing. `createSignaledWorker` for reactive worker communication.

### `@solid-primitives/broadcast-channel`

Cross-tab communication via BroadcastChannel API. `makeBroadcastChannel` and `createBroadcastChannel` for sending/receiving messages between browser tabs.

### `@solid-primitives/geolocation`

GPS/location tracking. `createGeolocation` for one-time position. `createGeolocationWatcher` for continuous tracking.

### `@solid-primitives/script-loader`

Dynamic script loading. `createScriptLoader` loads external scripts and provides a reactive loading state.

### `@solid-primitives/share`

Web Share API. `createWebShare` for native sharing. `createSocialShare` for social media share links.

---

## Network

### `@solid-primitives/connectivity`

Track online/offline status. `createConnectivitySignal` returns a boolean signal.

### `@solid-primitives/cookies`

Cookie management. `createServerCookie` for SSR. `getCookiesString` for reading cookies.

### `@solid-primitives/fetch`

Reactive fetch wrapper. `createFetch` provides reactive fetch with caching, refetching, and abort support.

### `@solid-primitives/graphql`

GraphQL client. `createGraphQLClient` for reactive GraphQL queries.

### `@solid-primitives/stream`

Media streams. `createStream` for camera/microphone access. `createAmplitudeStream` for audio levels. `createScreen` for screen capture.

### `@solid-primitives/websocket`

WebSocket primitives. `makeWS` / `createWS` for basic connections. `makeReconnectingWS` for auto-reconnect. `createWSState` for reactive connection state.

---

## Control Flow

### `@solid-primitives/context`

Simplified SolidJS Context API with better type inference. `createContextProvider` returns a `[Provider, useContext]` tuple. `MultiProvider` nests multiple providers without indentation hell.

### `@solid-primitives/jsx-tokenizer`

JSX children tokenization for building composable component APIs. `createTokenizer`, `createToken`, `resolveTokens` — parse JSX children into typed tokens for custom rendering logic.

### `@solid-primitives/keyed`

Keyed control flow components. `keyArray` and `<Key>` — like `<For>` but keyed by value reference rather than index. `<Entries>`, `<MapEntries>`, `<SetValues>` for iterating reactive collections.

### `@solid-primitives/list`

Non-keyed list rendering. `listArray` and `<List>` — like `<For>` but optimized for cases where items don't have stable keys.

### `@solid-primitives/match`

Pattern matching control flow. `<MatchTag>`, `<MatchValue>` — render based on discriminated unions or value matching.

### `@solid-primitives/range`

Range-based iteration. `repeat`, `mapRange`, `indexRange` — iterate over numeric ranges. `<Repeat>`, `<Range>`, `<IndexRange>` — JSX components for range rendering.

### `@solid-primitives/refs`

Manage JSX element references. `mergeRefs` composes multiple ref callbacks (essential when both library and consumer need a ref). `resolveElements` / `resolveFirst` — resolve nested JSX children to actual DOM elements. `<Ref>` / `<Refs>` — declarative ref components.

---

## Utilities

### `@solid-primitives/utils`

Foundational utility types, functions, and constants used across the `@solid-primitives` ecosystem. Many other packages depend on this. Has three entry points: main (`@solid-primitives/utils`), immutable submodule (`@solid-primitives/utils/immutable`), and string transforms (exported from main).

#### Types

**Accessor wrappers:**

- `MaybeAccessor<T>` — `T | Accessor<T>`. Accept either a plain value or a reactive accessor.
- `MaybeAccessorValue<T extends MaybeAccessor<any>>` — Unwraps a `MaybeAccessor<T>` to its inner value type.
- `OnAccessEffectFunction<S, Prev, Next>` — Effect function type for use with `on()` and `MaybeAccessor` deps.
- `AccessReturnTypes<S>` — Maps a tuple of `MaybeAccessor`s to their resolved value types.

**Collection types:**

- `Many<T>` — `T | T[]`. Accept single or array.
- `ItemsOf<T>` — Infer element type of `T` when `T` is an array.
- `ItemsOfMany<T>` — Infer element type of `Many<T>`.
- `Values<O>` — `O[keyof O]`. Union of all value types of an object.

**Function types:**

- `Noop` — `(...a: any[]) => void`.
- `AnyFunction` — `(...args: any[]) => any`.
- `AnyClass` — `new (...args: any[]) => any`.
- `Directive<P>` — Type for SolidJS `use:` directives. `(el: Element, props: Accessor<P>) => void`.
- `SetterParam<T>` — Parameter type of a `Setter<T>` (either `T` or `(prev: T) => T`).

**Object types:**

- `AnyObject` — `Record<string, any>`. Loose constraint for any object shape.
- `AnyStatic` — `Record<string, any>` for static stores.
- `Modify<T, R>` — Shallow overwrite of `T`'s properties with `R`'s properties.
- `ModifyDeep<T, R>` — Deep/recursive version of `Modify`.
- `DeepPartialAny<T>` — Deeply makes all properties optional with `any` value.

**Boolean narrowing:**

- `FalsyValue` — `false | 0 | "" | null | undefined`.
- `Truthy<T>` — Excludes `FalsyValue` from `T`.
- `Falsy<T>` — Extracts `FalsyValue` from `T`.
- `PrimitiveValue` — `string | number | boolean | symbol | bigint`.

**Advanced type utilities:**

- `NonIterable<T>` — Remove iterable/iterator interfaces from `T`.
- `RequiredKeys<T>` — Extract the keys of `T` that are required (non-optional).
- `Tail<T>` — All elements of a tuple except the first.
- `UnionToIntersection<U>` — Convert a union type to an intersection.
- `ExtractIfPossible<T, U>` — `Extract<T, U>` that falls back to `U` if the result is `never`.
- `Simplify<T>` — Flatten/simplify an intersection type into a plain object type.
- `UnboxLazy<T>` — If `T` is `() => infer V`, returns `V`, else returns `T`.
- `Narrow<T>` — Narrow a type to its literal type (prevents widening).
- `NoInfer<T>` — Prevent TypeScript from inferring a type parameter from this position.

**Geometry:**

- `Position` — `{ x: number; y: number }`.
- `Size` — `{ width: number; height: number }`.

**Reactive option types:**

- `EffectOptions` — Options for `createEffect` (`{ name?: string }`).
- `OnOptions` — Options for `on()` (`{ defer?: boolean }`).

**Resolved JSX (re-exported from solid-js):**

- `ResolvedJSXElement` — The resolved type of a JSX element (DOM node, string, array, etc.).
- `ResolvedChildren` — Resolved children type from `resolveChildren()`.

#### Constants

- `isServer` / `isClient` — `true` on server / client side respectively.
- `isDev` / `isProd` — `true` in development / production mode.
- `noop` — No-op function: `() => void`.
- `trueFn` / `falseFn` — Constant boolean accessors: `() => true` / `() => false`.
- `EQUALS_FALSE_OPTIONS` — `{ equals: false }` signal options (forces update on every set).
- `INTERNAL_OPTIONS` — `{ internal: true }` for internal solid-js primitives.

#### Value Access

- `access(v)` — Unwrap a `MaybeAccessor<T>` to `T`. Calls `v()` if function, returns `v` otherwise.
- `accessWith(v, ...args)` — Like `access` but passes extra arguments if `v` is a function. Useful for accessor callbacks that take parameters.
- `accessArray(list)` — `access` each item in an array of `MaybeAccessor`s, returning resolved values.
- `withAccess(v, fn)` — Run `fn(value)` only if `access(v)` is non-nullish. Returns `undefined` otherwise.
- `asAccessor(v)` — Normalize a `MaybeAccessor<T>` into an `Accessor<T>`. Wraps plain values in `() => v`.
- `asArray(v)` — Normalize a `Many<T>` (single value or array) to always be an array.

#### General Helpers

- `isObject(v)` — Check if value is a non-null object or function. Type guard for `object`.
- `isNonNullable(v)` — Type guard excluding `null` and `undefined`.
- `filterNonNullable(arr)` — Filter out `null`/`undefined` from arrays. Returns `NonNullable<T>[]`.
- `ofClass(v, c)` — `instanceof` check that also handles constructor identity (`v.constructor === c`).
- `compare(a, b)` — Generic comparator returning `-1`, `0`, or `1`.
- `clamp(n, min, max)` — Clamp a number between `min` and `max`.
- `arrayEquals(a, b)` — Shallow array equality (length + `===` per element).

#### Function Composition

- `chain(callbacks)` — Compose an iterable of functions into a single function that calls all in order. Skips non-function items.
- `reverseChain(callbacks)` — Same as `chain` but calls in reverse order.
- `createCallbackStack()` — Push/execute/clear pattern for callback lists. Returns `{ push, execute, clear }`.
- `createMicrotask(fn)` — Deduplicated microtask scheduling. Calls `fn` at most once per microtask, no matter how many times the returned trigger is called.

#### Reactive Helpers

- `tryOnCleanup(fn)` — `onCleanup` that silently no-ops outside a reactive owner context (no warning).
- `defer(deps, fn, options?)` — Shorthand for `on(deps, fn, { defer: true })`. Skips the initial run, only fires on subsequent changes. Overloads accept a single dep or an array.
- `createHydratableSignal(serverValue, options?)` — Creates a signal that uses `serverValue` during SSR/hydration, then falls back to normal `createSignal` on the client. Useful for signals that need different initial values server vs client.
- `handleDiffArray(current, prev, handlers)` — Diff two arrays and call `onAdded(item)` / `onRemoved(item)` for items present only in one. Linear-time algorithm using `Map` for counting occurrences.

#### Object/Key Helpers

- `entries(obj)` — Typed `Object.entries`. Returns `[key, value][]` with proper key types.
- `keys(obj)` — Typed `Object.keys`. Returns `(keyof T)[]`.

#### String Transforms

String transform functions that convert string inputs into parsed values. Designed for composition with `pipe`.

- `json` — Parse JSON string to object: `JSON.parse(string)`.
- `ndjson` — Parse newline-delimited JSON. Splits by newline, filters empties, parses each line.
- `lines` — Split string by newlines into `string[]`.
- `number` — Parse string to number via `Number()`.
- `safe(transform)` — Wrap a transform to catch errors — returns `undefined` on failure instead of throwing.
- `pipe(...transforms)` — Compose transforms left-to-right. `pipe(json, safe)` first parses JSON, then wraps in error handling.

```ts
import { json, safe, pipe, lines } from '@solid-primitives/utils';

const safeJson = pipe(json, safe); // string → object | undefined
const parseLines = lines; // string → string[]
```

#### Immutable Submodule (`@solid-primitives/utils/immutable`)

Pure, non-mutating helpers for working with arrays, objects, and numbers. Each function returns a new value without modifying the original. Import from `@solid-primitives/utils/immutable`.

```ts
import { pick, push, withArrayCopy } from '@solid-primitives/utils/immutable';
```

**Immutable types:**

- `Predicate<T>` — `(item: T) => boolean`. Filter/test predicate.
- `MappingFn<T, U>` — `(item: T, index: number) => U`. Mapping function.
- `FlattenArray<T>` — Recursively flatten array type.
- `ModifyValue<T, K, V>` — Modify a specific key's type in an object.
- `UpdateSetter<T>` — `T | ((prev: T) => T)`. Value or updater function for `update`.

**Copying:**

- `shallowArrayCopy(array)` — `array.slice()`. Shallow copy an array.
- `shallowObjectCopy(object)` — `Object.assign({}, object)`. Shallow copy an object.
- `shallowCopy(target)` — Dispatches to `shallowArrayCopy` or `shallowObjectCopy` based on type.
- `withArrayCopy(array, mutate)` — Copy array, apply mutation to the copy, return the copy.
- `withObjectCopy(object, mutate)` — Copy object, apply mutation to the copy, return the copy.
- `withCopy(target, mutate)` — Dispatches to `withArrayCopy` or `withObjectCopy` based on type.

```ts
const next = withArrayCopy(items, (draft) => {
  draft.splice(1, 1); // mutate the copy freely
  draft.push(newItem);
});
// items is unchanged, next is the modified copy
```

**Array operations:**

All return new arrays without mutating the original.

- `push(array, ...items)` — Append items.
- `drop(array, n?)` — Remove first `n` items (default 1).
- `dropRight(array, n?)` — Remove last `n` items (default 1).
- `filterOut(array, item)` — Remove all occurrences of `item` (by `===`).
- `filter(array, predicate)` — Immutable `Array.filter`.
- `sort(array, compareFn?)` — Immutable `Array.sort`.
- `sortBy(array, mapFn, compareFn?)` — Sort by a mapped value (Schwartzian transform).
- `map(array, mapFn)` — Immutable `Array.map`.
- `slice(array, start?, end?)` — Immutable `Array.slice`.
- `splice(array, start, deleteCount?, ...items)` — Immutable `Array.splice`.
- `fill(array, value, start?, end?)` — Immutable `Array.fill`.
- `concat(array, ...items)` — Immutable `Array.concat`.
- `remove(array, item)` — Remove the first occurrence of `item`.
- `removeItems(array, items)` — Remove all items in the `items` array.
- `flatten(array)` — Recursively flatten nested arrays.
- `filterInstance(array, class)` — Keep only instances of the given class.
- `filterOutInstance(array, class)` — Remove all instances of the given class.

**Object operations:**

- `omit(object, ...keys)` — Return a copy with specified keys removed.
- `pick(object, ...keys)` — Return a copy with only specified keys.
- `get(object, key)` — Type-safe property access. `object[key]`.
- `split(object, ...keys)` — Split into two objects: one with the specified keys, one with the rest. Returns `[picked, rest]`.
- `merge(...objects)` — Shallow merge multiple objects (`Object.assign` into new object).

**Object/Array update:**

- `update(target, key, setter)` — Immutably update a property/index. `setter` can be a value or `(prev) => next` function.

```ts
const next = update(user, 'name', 'Alice');
const next2 = update(scores, 0, (prev) => prev + 1);
```

**Number operations:**

All are binary functions `(a: number, b: number) => number`, useful as reducers.

- `add(a, b)` — `a + b`.
- `substract(a, b)` — `a - b`.
- `multiply(a, b)` — `a * b`.
- `divide(a, b)` — `a / b`.
- `power(a, b)` — `a ** b`.
- `clamp(n, min, max)` — Clamp between min and max (same as main export).

### `@solid-primitives/controlled-props`

Create controlled/uncontrolled prop patterns. `createControlledProp` — like React's controlled vs uncontrolled input pattern for SolidJS components.

### `@solid-primitives/cursor`

Reactively set CSS cursor. `createElementCursor` sets cursor on a specific element. `createBodyCursor` sets it on `<body>`. Pass a reactive accessor that returns the cursor string or `null`.

### `@solid-primitives/date`

Reactive date/time utilities. `createDate` for reactive Date objects. `createDateNow` for current time with configurable interval. `createTimeAgo` for relative time strings. `createCountdown` for countdowns.

### `@solid-primitives/event-bus`

Pubsub/event emitter primitives. `createEventBus` for typed event channels. `createEmitter` for multi-event emitters. `createEventHub` for namespaced event systems. `createEventStack` for event queues.

### `@solid-primitives/event-dispatcher`

DOM CustomEvent dispatching. `createEventDispatcher` — dispatch typed custom events on DOM elements.

### `@solid-primitives/flux-store`

Redux-like flux state management. `createFluxStore` for stores with reducers. `createActions` for action creators.

### `@solid-primitives/history`

Undo/redo history tracking. `createUndoHistory` wraps a signal with undo/redo capabilities, configurable history depth.

### `@solid-primitives/i18n`

Internationalization. `translator`, `scopedTranslator`, `chainedTranslator` — reactive translation functions with template resolution.

### `@solid-primitives/platform`

Platform detection. Variables for detecting browser, OS, touch support, etc. Useful for adapting behavior per platform.

### `@solid-primitives/promise`

Promise utilities. `promiseTimeout` for timed promises. `raceTimeout` for timeout racing. `until` for waiting on a reactive condition.

### `@solid-primitives/props`

Component prop utilities. `combineProps` merges multiple props objects (handles event handlers, class, style merging). `filterProps` picks/omits props.

### `@solid-primitives/scheduled`

Scheduled/throttled/debounced callbacks.

- `throttle(fn, ms)` — At most once per interval.
- `debounce(fn, ms)` — Delay until activity stops.
- `scheduleIdle(fn)` — Run during idle periods.
- `leading(fn, ms)` — Fire immediately, then throttle.
- `leadingAndTrailing(fn, ms)` — Fire on both edges.
- `createScheduled(fn)` — Reactive scheduled primitive.

---

## Reactivity

### `@solid-primitives/set`

Reactive `Set` and `WeakSet`. `ReactiveSet` — reads (`.has()`, `.size`, iteration) are tracked as signals. Mutations (`.add()`, `.delete()`) trigger updates. Provides granular per-key reactivity.

### `@solid-primitives/map`

Reactive `Map` and `WeakMap`. `ReactiveMap` — same pattern as ReactiveSet. `.get(key)` is tracked per-key. `.set(key, value)` only notifies dependents of that key.

### `@solid-primitives/memo`

Extended memo primitives.

- `createWritableMemo` — A computed value that can be manually overridden.
- `createLazyMemo` — Only computes when actually read (not eagerly).
- `createPureReaction` — Side-effect-free reaction that returns tracked dependencies.
- `createMemoCache` — Keyed memo cache with automatic invalidation.
- `createReducer` — Redux-style reducer pattern as a signal.
- `createLatest` / `createLatestMany` — Track the most recent non-undefined signal value.

### `@solid-primitives/signal-builders`

Chainable composable signal calculations. Array operations (push, filter, sort, map), object operations (merge, pick), number operations (clamp, lerp), string operations (concat, template).

### `@solid-primitives/state-machine`

Finite state machine primitive. `createMachine` — define states, transitions, and guards. Returns reactive `state` signal and `send` function.

### `@solid-primitives/static-store`

Lightweight reactive objects with static (known-at-creation-time) keys. `createStaticStore` — no Proxy overhead, each key is an independent signal. `createDerivedStaticStore` for computed static stores. More performant than `createStore` for small objects with fixed shape.

### `@solid-primitives/trigger`

Manual trigger signals. `createTrigger` — a signal you explicitly `track()` and `dirty()`. `createTriggerCache` — keyed triggers for fine-grained invalidation (e.g., invalidate recalculation for a specific item without affecting others).

### `@solid-primitives/deep`

Deep tracking of nested stores. `trackDeep` deeply tracks all nested properties of a store. `trackStore` is the same. `captureStoreUpdates` returns a diff of what changed in a store update.

### `@solid-primitives/destructure`

Destructure reactive objects into individual signals. `destructure({ x, y })` returns `{ x: Accessor, y: Accessor }` where each property is independently tracked.

### `@solid-primitives/immutable`

Create deeply immutable reactive objects. `createImmutable` — like `createStore` but prevents mutations, useful for passing read-only state to children.

### `@solid-primitives/mutable`

Mutable reactive objects (like Vue's reactivity model). `createMutable` — direct property assignment triggers reactive updates.

### `@solid-primitives/lifecycle`

Component lifecycle helpers. `createIsMounted` — boolean signal for mount state. `isHydrated` — detect SSR hydration. `onElementConnect` — callback when element is actually connected to DOM.

### `@solid-primitives/rootless`

Manage reactive roots outside components. `createSubRoot` for nested disposal. `createCallback` for owner-less callbacks. `createSharedRoot` for singleton reactive computations. `createRootPool` for pooling roots.

### `@solid-primitives/resource`

Async resource utilities. `createAggregated` for combining resources. `createDeepSignal` for deeply reactive async data. `makeAbortable` for cancellable async operations. `makeRetrying` for retry logic.

### `@solid-primitives/db-store`

Database-backed reactive stores. `createDbStore` syncs a SolidJS store with a database (Supabase adapter included).

---

## Animation

### `@solid-primitives/raf`

Reactive `requestAnimationFrame` loop. `createRAF` returns `[running, start, stop]` for a frame loop. `createMs` returns a reactive millisecond counter. `targetFPS` wraps a callback with FPS limiting.

### `@solid-primitives/spring`

Spring physics interpolation. `createSpring` smoothly interpolates numbers, arrays, or objects using configurable stiffness/damping/precision. `createDerivedSpring` for computed springs.

### `@solid-primitives/tween`

Smooth numeric tweening. `createTween` transitions a numeric signal from old→new value over configurable duration with easing functions, using `requestAnimationFrame`.

### `@solid-primitives/transition-group`

Transition effects for element lists. `createListTransition` animates enter/move/exit of list items with callbacks for each phase. `createSwitchTransition` for switching between single elements.

### `@solid-primitives/presence`

Animate element enter/exit. `createPresence` tracks mount lifecycle: `isMounted`, `isVisible`, `isEntering`, `isExiting`. Keeps element in DOM during exit animation.

---

## UI Patterns

### `@solid-primitives/virtual`

Virtual scrolling for large lists. `createVirtualList` and `<VirtualList>` — only renders visible items plus a buffer. Provides reactive `items`, `scrollTo`, and container props.

### `@solid-primitives/masonry`

Masonry layout primitive. `createMasonry` computes masonry column assignments for items with variable heights.

### `@solid-primitives/pagination`

Pagination and infinite scroll. `createPagination` for page-based navigation. `createInfiniteScroll` for load-on-scroll patterns.

### `@solid-primitives/marker`

Element marking/highlighting. `createMarker` for annotating DOM elements.
