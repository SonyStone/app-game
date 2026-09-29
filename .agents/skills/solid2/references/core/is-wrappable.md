# isWrappable

Returns whether a value would be wrapped in a store proxy. Plain objects, arrays, and class instances are wrappable; built-in objects such as `Map` and `Date`, frozen objects, and primitives are not.

## Import

```ts
import { isWrappable } from "solid-js";
```

## Type signature

```ts
function isWrappable<T>(obj: T | NotWrappable): obj is T;
```

## Parameters

### `obj`

* **Type:** `T | NotWrappable`

## Learn more

* [Stores](../concepts/stores.md)

## Related types

### `NotWrappable`

```ts
type NotWrappable =
	| string
	| number
	| bigint
	| symbol
	| boolean
	| Function
	| null
	| undefined
	| SolidStore.Unwrappable[keyof SolidStore.Unwrappable];
```
