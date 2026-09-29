# @solid-primitives/mutable

Source version: `3.0.0-next.3`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/mutable/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


A primitive for creating a mutable store proxy object. A compatibility layer for code that relies on direct mutation semantics (similar to MobX/Vue reactivity).

- [**Docs (Storybook)**](https://primitives.solidjs.community/storybook/?path=/docs/reactivity-mutable--docs)
- [`createMutable`](mutable.md#createmutable) - Creates a mutable store proxy object.
- [`modifyMutable`](mutable.md#modifymutable) - Helper for applying multiple mutations to a mutable store in one call.

## Installation

```bash
npm install @solid-primitives/mutable
# or
pnpm add @solid-primitives/mutable
# or
yarn add @solid-primitives/mutable
```

## `createMutable`

```ts
import { createMutable } from "@solid-primitives/mutable";

declare function createMutable<T extends object>(state: T, options?: {}): T;
```

Creates a new mutable Store proxy object. Stores only trigger updates on values changing. Tracking is done by intercepting property access and automatically tracks deep nesting via proxy.

Useful for integrating external systems or as a compatibility layer with MobX/Vue.

> **Note:** A mutable state can be passed around and mutated anywhere, which can make it harder to follow and easier to break unidirectional flow. It is generally recommended to use `createStore` instead.

```js
const state = createMutable(initialValue);

// read value
state.someValue;

// set value
state.someValue = 5;

state.list.push(anotherValue);
```

Mutables support setters along with getters.

```js
const user = createMutable({
  firstName: "John",
  lastName: "Smith",
  get fullName() {
    return `${this.firstName} ${this.lastName}`;
  },
  set fullName(value) {
    [this.firstName, this.lastName] = value.split(" ");
  },
});
```

Only plain objects and arrays are deep-proxied. Class instances (e.g. `Date`, `Map`, `Set`) are stored and returned as-is.

### Reactivity and flushing

Signal writes are automatically batched to the next microtask. Reads outside a reactive context (effects, memos, JSX) always reflect the latest written value immediately without waiting for a flush.

In tests, call `flush()` (from `solid-js`) after writes to synchronously apply pending updates before asserting on reactive state:

```ts
import { flush } from "solid-js";
import { createMutable } from "@solid-primitives/mutable";

const state = createMutable({ count: 0 });

createEffect(
  () => state.count,
  value => console.log(value),
);
flush(); // runs initial effect

state.count = 1;
flush(); // applies update, re-runs effect
```

## `modifyMutable`

```ts
import { modifyMutable } from "@solid-primitives/mutable";

declare function modifyMutable<T>(state: T, modifier: (state: T) => void): void;
```

Applies multiple mutations to a mutable Store via a single modifier function. The modifier receives the mutable proxy (or nested proxy) directly and mutates it in place. Because all signal writes are automatically batched, dependent computations update once after the modifier returns.

```ts
const state = createMutable({
  user: {
    firstName: "John",
    lastName: "Smith",
  },
});

// Modify two fields — single reactive update
modifyMutable(state.user, u => {
  u.firstName = "Jake";
  u.lastName = "Johnson";
});
```

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/mutable/CHANGELOG.md)
