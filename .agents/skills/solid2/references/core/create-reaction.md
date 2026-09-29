# createReaction

Creates a reactive computation that runs after the render phase with flexible tracking.

```typescript
const track = createReaction(effectFn, options?: EffectOptions);
track(() => { // reactive reads });
```

## Import

```ts
import { createReaction } from "solid-js";
```

## Type signature

```ts
function createReaction(
	effectFn: EffectFunction<undefined> | EffectBundle<undefined>,
	options?: EffectOptions
): (tracking: () => void) => void;
```

## Parameters

### `effectFn`

* **Type:** `EffectFunction<undefined> | EffectBundle<undefined>`

A function (or `EffectBundle`) that is called when tracked function is invalidated

### `options`

* **Type:** `EffectOptions`
* Optional

`EffectOptions` -- name, defer

## Examples

```ts
const [count, setCount] = createSignal(0);

const track = createReaction(() => {
	console.log("count changed once, re-arm to listen again");
	track(() => count()); // re-arm
});

track(() => count()); // initial arm

setCount(1); // logs once, reaction re-armed for next change
```

## Learn more

* [Avoid unnecessary effects](../guides/avoid-unnecessary-effects.md)
* [Debugging reactivity](../guides/debugging-reactivity.md)
