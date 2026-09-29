# @solid-primitives/flux-store

Source version: `1.0.0-next.3`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/flux-store/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


A library for creating Solid stores that enforce a one-way data flow through explicit getters for reads and actions for writes.

- [`createFluxStore`](flux-store.md#createfluxstore) — Creates a store instance with explicit getters and actions.
- [`createFluxStoreFactory`](flux-store.md#createfluxstorefactory) — Creates a `FluxStore` encapsulated in a factory function for reusable store instances.
- [`createActions`](flux-store.md#createactions) — Wraps a record of functions so each runs untracked.
- [`createAction`](flux-store.md#createaction) — Wraps a single function so it runs untracked.

## Installation

```bash
npm install @solid-primitives/flux-store
# or
yarn add @solid-primitives/flux-store
# or
pnpm add @solid-primitives/flux-store
```

## `createFluxStore`

Creates a `FluxStore` — a Solid store that separates reads (`getters`) from writes (`actions`).

### How to use it

`createFluxStore` takes two arguments:

- `initialState` — the initial state object.
- `createMethods` — object with optional `getters` and required `actions` factory functions.
  - `getters(state)` — return a record of functions that read from the reactive store proxy.
  - `actions(setState, state)` — return a record of mutation functions. `setState` uses draft-first mutations: pass a function that mutates the draft object directly.

```ts
import { createFluxStore } from "@solid-primitives/flux-store";

const counterStore = createFluxStore(
  { value: 5 },
  {
    getters: state => ({
      count: () => state.value,
      isNegative: () => state.value < 0,
    }),
    actions: setState => ({
      increment(by = 1) {
        setState(s => {
          s.value += by;
        });
      },
      reset() {
        setState(s => {
          s.value = 0;
        });
      },
    }),
  },
);

counterStore.getters.count(); // => 5
counterStore.actions.increment();
counterStore.getters.count(); // => 6
counterStore.actions.reset();
counterStore.getters.count(); // => 0
```

## `createFluxStoreFactory`

Creates a reusable factory function that produces independent `FluxStore` instances from the same schema, with an optional initial-state override per instance.

### How to use it

```ts
import { createFluxStoreFactory } from "@solid-primitives/flux-store";

const createToggleStore = createFluxStoreFactory(
  { value: false },
  {
    getters: state => ({
      isOn: () => state.value,
    }),
    actions: setState => ({
      toggle() {
        setState(s => {
          s.value = !s.value;
        });
      },
    }),
  },
);

// Each call creates an isolated store instance
const toggleA = createToggleStore({ value: true });
const toggleB = createToggleStore();

toggleA.getters.isOn(); // => true
toggleB.getters.isOn(); // => false

toggleA.actions.toggle();
toggleA.getters.isOn(); // => false
toggleB.getters.isOn(); // => false (unaffected)
```

The factory accepts an optional override as a plain object or a function:

```ts
const store1 = createToggleStore({ value: true });
const store2 = createToggleStore(defaults => ({ ...defaults, value: true }));
```

## `createActions`

Wraps each function in a record with `createAction` and returns a new object of the same shape. Useful for applying the untracked wrapper to a batch of functions at once.

```ts
import { createActions } from "@solid-primitives/flux-store";

const actions = createActions({
  increment: () => setCount(c => c + 1),
  reset: () => setCount(0),
});
```

## `createAction`

Wraps a single function so its body runs inside `untrack` — reactive reads inside will not register dependencies and writes will not throw inside owned scopes.

```ts
import { createAction } from "@solid-primitives/flux-store";

const increment = createAction(() => setCount(c => c + 1));
```

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/flux-store/CHANGELOG.md)
