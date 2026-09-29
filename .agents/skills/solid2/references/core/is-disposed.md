# isDisposed

Returns `true` when an owner has been disposed. Use it to ignore late work after the owner’s component or reactive scope has been removed.

## Import

```ts
import { isDisposed } from "solid-js";
```

## Type signature

```ts
function isDisposed(node: Owner): boolean;
```

## Parameters

### `node`

* **Type:** `Owner`

## Examples

```ts
function onSettleSafe(fn: () => void) {
	const owner = getOwner();
	queueMicrotask(() => {
		if (owner && isDisposed(owner)) return; // component unmounted; skip
		runWithOwner(owner, fn);
	});
}
```

## Learn more

* [Run outside a component](../guides/custom-primitives.md#run-outside-a-component)
* [Ownership](../concepts/reactivity.md#ownership)
* [Custom primitives](../guides/custom-primitives.md)
