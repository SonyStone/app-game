# resolve

Awaits a reactive expression and returns its first fully-settled value as a
`Promise`. Pending async reads (`createMemo` returning a promise, etc.) are
waited on; once the expression returns synchronously without `NotReadyError`
the promise resolves with that value. If the expression settles with an
error instead — including an async source that rejects — the promise
rejects with it.

Must be called *outside* a tracking scope — it doesn't subscribe, it only
resolves the current value once.

## Import

```ts
import { resolve } from "solid-js";
```

## Type signature

```ts
function resolve<T>(fn: () => T): Promise<T>;
```

## Parameters

### `fn`

* **Type:** `() => T`

A reactive expression to resolve

## Examples

```ts
const user = createMemo(() => fetch(`/users/${id()}`).then((r) => r.json()));

// outside any reactive scope
const initial = await resolve(() => user());
```

## Learn more

* [Async reactivity](../concepts/async-reactivity.md)
* [Integrate non-Solid code](../guides/integrate-non-solid-code.md)
