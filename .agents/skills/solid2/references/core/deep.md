# deep

Subscribes the surrounding scope to every reachable level of a store value, then returns its plain view. Use it when any change anywhere in the subtree should re-run the computation.

## Import

```ts
import { deep } from "solid-js";
```

## Type signature

```ts
function deep<T>(value: T): T;
```

## Parameters

### `value`

* **Type:** `T`

## Learn more

* [Stores](../concepts/stores.md)
