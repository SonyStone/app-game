# untrack

Runs `fn` outside of any reactive tracking — reads inside `fn` will not
subscribe the current scope. Returns whatever `fn` returns.

Use `untrack` inside a memo or effect when you need to read a signal once
without making the surrounding computation depend on its future changes.

Pass a `strictReadLabel` string to enable a dev-mode warning: any reactive
read inside `fn` that isn't inside a nested tracking scope will log a
warning naming the label.

## Import

```ts
import { untrack } from "solid-js";
```

## Type signature

```ts
function untrack<T>(fn: () => T, strictReadLabel?: string | false): T;
```

## Parameters

### `fn`

* **Type:** `() => T`

Function to run without tracking. Its return value is returned.

### `strictReadLabel`

* **Type:** `string | false`
* Optional

When set, development builds warn about reactive reads inside `fn` and name the label in the warning.

## Return value

The value `fn` returns.

## Examples

```ts
createEffect(
	() => trigger(), // tracks `trigger` only
	() => {
		const snapshot = untrack(() => state); // read once, untracked
		log(snapshot);
	}
);
```

## Caveats

* Untracking a read does not stop the computation from re-running for its other tracked reads.
* Inside an effect, prefer the two-phase form: reads in `effectFn` are already untracked.

## Common problems

* [Something does not update](../guides/debugging-reactivity.md#something-does-not-update)
* [Something updates too often](../guides/debugging-reactivity.md#something-updates-too-often)

## Learn more

* [Effects](../concepts/reactivity.md#effects)
* [Reactivity](../concepts/reactivity.md)
* [Async reactivity](../concepts/async-reactivity.md)
* [Debugging reactivity](../guides/debugging-reactivity.md)
