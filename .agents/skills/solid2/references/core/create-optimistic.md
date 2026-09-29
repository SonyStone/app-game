# createOptimistic

Creates an optimistic signal — a `Signal<T>` whose writes are
tentative inside an `action`: they show up immediately,
then auto-revert (or reconcile to the action's resolved value) once
the pending work settles.

Use this for single-value optimistic state. For collection-shaped
state, prefer `createOptimisticStore`.

* **Plain form** — `createOptimistic(value, options?: SignalOptions<T>)`.
* **Function form** — `createOptimistic(fn, options?: SignalOptions<T> & MemoOptions<T>)`:
  the authoritative value is recomputed by `fn`; the optimistic
  overlay reverts after each action.

## Import

```ts
import { createOptimistic } from "solid-js";
```

## Type signature

```ts
function createOptimistic<T>(): Signal<T | undefined>;
function createOptimistic<T>(
	value: Exclude<T, Function>,
	options?: SignalOptions<T>
): Signal<T>;
function createOptimistic<T>(
	fn: ComputeFunction<NoInfer<T>, T>,
	options: SignalOptions<T> & MemoOptions<T> & { loadingValue: T }
): Signal<T>;
function createOptimistic<T>(
	fn: ComputeFunction<undefined | NoInfer<T>, T>,
	options?: SignalOptions<T> & MemoOptions<T>
): Signal<T>;
```

## Parameters

### `value`

* **Type:** `Exclude<T, Function>`

Initial value of the authoritative signal.

### `options`

* **Type:** `SignalOptions<T>`
* Optional

Debug `name` and `equals` comparator. The function form also accepts `MemoOptions<T>`.

### `fn`

* **Type:** `ComputeFunction<T | undefined, T>`

Compute function for the derived form. It produces the authoritative value; optimistic writes overlay it and revert when the action settles.

## Return value

`[state: Accessor<T>, setState: Setter<T>]`

A tuple with the same shape as `createSignal`. Writes made inside an action are tentative and revert when the action settles.

## Examples

```ts
const [name, setName] = createOptimistic("Ada");

const rename = action(function* (next: string) {
	setName(next); // optimistic
	yield api.rename(next); // commits or reverts on settle
});
```

**Hydration:** in the function form, accepts an `ssrSource` field
(`"server"` | `"hybrid"` | `"client"`). See the `ssrSource` option.

## Caveats

* Make optimistic writes inside an `action`. The action's settle is what reverts the overlay or reconciles it to the resolved value.
* To keep a value after the action, write it to the authoritative source inside the action; the overlay itself does not persist.

## Learn more

* [Move the cart to the server](../concepts/mutations.md#move-the-cart-to-the-server)
* [Reactivity](../concepts/reactivity.md)
* [Async reactivity](../concepts/async-reactivity.md)
* [Debugging reactivity](../guides/debugging-reactivity.md)
