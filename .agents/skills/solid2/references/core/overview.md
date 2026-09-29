# solid-js

`solid-js` is the reactive core.
It has no knowledge of the DOM; the same primitives run in the browser, on the server, and in tests.
Rendering functions live in [`@solidjs/web`](../web/overview.md).

Every export here is imported from `"solid-js"`:

```ts
import { createSignal, createMemo, createStore, Show, For } from "solid-js";
```

## Reactivity

Values that change over time and the computations that follow them.
[Reactivity](../concepts/reactivity.md) explains the model.

* [`createSignal`](create-signal.md) creates a readable, writable value.
* [`createMemo`](create-memo.md) derives a cached value from other reactive reads, including async ones.
* [`createEffect`](create-effect.md) runs side effects after tracked values change.
* [`createOptimistic`](create-optimistic.md) creates a signal whose writes inside an action are tentative.
* [`isPending`](is-pending.md) reports that a new answer is on the way; [`latest`](latest.md) reads it early.
* [`untrack`](untrack.md) reads without subscribing; [`flush`](flush.md) drains the update queue now.

## Stores

Nested reactive state with per-property tracking.
[Stores](../concepts/stores.md) covers drafts, projections, and optimistic stores.

* [`createStore`](create-store.md) wraps an object or array; the setter receives a draft.
* [`createProjection`](create-projection.md) derives a read-only store from other reactive reads.
* [`createOptimisticStore`](create-optimistic-store.md) is the store form of `createOptimistic`.
* [`reconcile`](reconcile.md) merges new data into a store by key.
* [`merge`](merge.md) and [`omit`](omit.md) combine and split props without losing reactivity.

## Lifecycle and actions

Coordinating async work and the moments around it.
[Async reactivity](../concepts/async-reactivity.md) is the concept page.

* [`action`](action.md) runs a mutation whose writes commit together.
* [`onSettled`](on-settled.md) runs once after the current owner's pending work has finished, and can return a cleanup.
* [`refresh`](refresh.md) re-asks an async source; [`affects`](affects.md) marks values as pending while it does.
* [`until`](until.md) awaits a reactive condition.

## Components and context

* [`createContext`](create-context.md) and [`useContext`](use-context.md) share a value with a subtree.
* [`children`](children.md) resolves `props.children` for inspection.
* [`lazy`](lazy.md) code-splits a component.
* [`createUniqueId`](create-unique-id.md) generates ids that match between server and client.

## Flow components

Built-in components for conditions, lists, and boundaries.
[Components and JSX](../concepts/components-and-jsx.md) and [Boundaries](../concepts/boundaries.md) show them in use.

* [`Show`](show.md) renders content when a condition holds.
* [`Switch` and `Match`](switch-and-match.md) pick the first matching branch.
* [`For`](for.md) renders a row per array item; [`Repeat`](repeat.md) renders a row per index.
* [`Loading`](loading.md) shows a fallback while async reads have no value.
* [`Errored`](errored.md) renders a fallback when the subtree throws.
* [`Reveal`](reveal.md) orders how sibling `Loading` boundaries appear.

## Advanced

Owner introspection, specialized effects, store internals, boundary primitives, manual hydration, interop, and development hooks.
These pages support libraries and tooling; application code rarely needs them.

* [`createRoot`](create-root.md), [`getOwner`](get-owner.md), and [`runWithOwner`](run-with-owner.md) manage reactive scopes by hand.
* [`createRenderEffect`](create-render-effect.md) and [`onCleanup`](on-cleanup.md) serve renderers and custom primitives.
* [`createLoadingBoundary`](create-loading-boundary.md) and [`createErrorBoundary`](create-error-boundary.md) back the flow components.
* [`DEV`](dev.md) exposes the development diagnostics that [Debugging reactivity](../guides/debugging-reactivity.md) reads.

## Types

* [Reactive types](reactive-types.md): `Accessor`, `Setter`, `Signal`
* [Store types](store-types.md): `Store`
* [Component types](component-types.md): `Component`, `ParentProps`, `ValidComponent`, and friends
* [Context types](context-types.md) and [`Owner`](owner.md)
* [`JSX`](jsx-types.md): `JSX.Element` and the intrinsic element attributes
