# getOwner

Returns the current reactive **owner** — the lifecycle node that the next
`cleanup()` / `onCleanup()` / `createSignal()` etc. Will be attached to.

Returns `null` if called outside any owner. Capture the owner with
`getOwner()` and re-enter it later with `runWithOwner(owner, fn)` to attach
disposables created from a callback (event handler, async resolution, etc.)
back to a component's lifecycle.

## Import

```ts
import { getOwner } from "solid-js";
```

## Type signature

```ts
function getOwner(): Owner | null;
```

## Examples

```ts
function defer<T>(fn: () => T) {
	const owner = getOwner();
	queueMicrotask(() => runWithOwner(owner, fn));
}
```

## Learn more

* [Run outside a component](../guides/custom-primitives.md#run-outside-a-component)
* [Ownership](../concepts/reactivity.md#ownership)
* [Custom primitives](../guides/custom-primitives.md)

## Related types

### `NoOwnerError`

```ts
class NoOwnerError extends Error {
	constructor() {
		super(__DEV__ ? "Context can only be accessed under a reactive root." : "");
	}
}
```
