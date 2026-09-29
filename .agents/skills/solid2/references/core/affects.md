# affects

Marks a reactive source or store location as pending while work that will change it is in flight. Marked values remain readable, and derived readers report the pending state until the surrounding action or update settles.

## Import

```ts
import { affects } from "solid-js";
```

## Type signature

```ts
function affects(target: Accessor<unknown> | Store<object>): void;
function affects<T extends object>(target: Store<T>, key: keyof T): void;
```

## Parameters

### `target`

* **Type:** `Accessor<unknown> | Store<object> | Store<T>`

An accessor, a store, or a store node to mark as pending.

### `key`

* **Type:** `keyof T`

When `target` is a store, the property to mark instead of the whole store.

## Examples

```ts
const send = action(function* (text: string) {
	setState((s) => {
		s.messages.push({ text, status: "sending" });
	});
	affects(state.messages.at(-1)!, "status"); // this slot pends until settle
	yield api.send(text);
});

const reload = action(function* () {
	affects(thing); // the whole store pends…
	refresh(thing); // …over this otherwise-quiet re-ask
	yield api.done();
});
```

## Caveats

* Marking does not change the value or trigger a refetch; it only reports pending. Pair with `refresh()` to re-ask.

## Common problems

* [The screen looks dead after a click](../guides/debugging-reactivity.md#the-screen-looks-dead-after-a-click)

## Learn more

* [Mark data as changing: `affects`](../concepts/mutations.md#mark-data-as-changing-affects)
* [Async reactivity](../concepts/async-reactivity.md)
* [Avoid unnecessary effects](../guides/avoid-unnecessary-effects.md)
