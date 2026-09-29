# snapshot

Returns the plain, unwrapped view of a store value without tracking, for serialization or for passing to code that must not observe the store. Subtrees with no pending changes are returned as-is rather than copied.

## Import

```ts
import { snapshot } from "solid-js";
```

## Type signature

```ts
function snapshot<T>(value: T): T;
```

## Parameters

### `value`

* **Type:** `T`

## Learn more

* [Stores](../concepts/stores.md)
