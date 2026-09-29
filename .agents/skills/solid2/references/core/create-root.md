# createRoot

Creates a reactive root — an owner scope with its own `dispose()`. A root
created inside an existing owner is owned by it and is disposed when the
parent is disposed; call `dispose()` to tear it down earlier. To create a
root that outlives its creator, detach explicitly:
`runWithOwner(null, () => createRoot(...))`. Pass `id` to seed hydration
ids for the tree it owns.

```ts
const dispose = createRoot((dispose) => {
	// ...
	return dispose;
});

// Detached from the current owner (lives until `detached()` is called):
const detached = runWithOwner(null, () => createRoot((d) => d));
```

**Hydration:** a root created during hydration marks itself as the
snapshot scope, so writes landing during the hydration pass are held
until the pass completes (the mark used to depend on which primitive
ran first under it).

> `render()` creates the root for normal app code. Reach for `createRoot` in tests, libraries, or non-render entry points that need to host a reactive scope.

## Import

```ts
import { createRoot } from "solid-js";
```

## Type signature

```ts
function createRoot<T>(
	init: ((dispose: () => void) => T) | (() => T),
	options?: { id?: string; transparent?: boolean }
): T;
```

## Parameters

### `init`

* **Type:** `((dispose: () => void) => T) | (() => T)`

### `options`

* **Type:** `{ id?: string; transparent?: boolean }`
* Optional

## Examples

```ts
// At module level there is no owner, so this root lives until disposed.
const dispose = createRoot((dispose) => {
	const [n, setN] = createSignal(0);
	createEffect(
		() => n(),
		(value) => console.log(value)
	);
	setInterval(() => setN((x) => x + 1), 1000);
	return dispose;
});

// Later, to tear everything down:
dispose();

// Inside an owner (component, effect, another root), detach explicitly
// if the root must outlive its creator:
const detached = runWithOwner(null, () => createRoot((d) => d));
```

## Learn more

* [Run outside a component](../guides/custom-primitives.md#run-outside-a-component)
* [Ownership](../concepts/reactivity.md#ownership)
* [Custom primitives](../guides/custom-primitives.md)
