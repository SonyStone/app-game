# flatten

Resolves a children value to its renderable form: unwraps zero-arg functions
(accessors), recursively flattens arrays, and optionally skips
non-rendering values (`null`, `undefined`, `true`, `false`, `""`).

Used internally by flow components and by the renderer to walk a children
tree. App code rarely needs this directly — see `children()` in `solid-js`
for the user-facing helper that memoizes the result.

## Import

```ts
import { flatten } from "solid-js";
```

## Type signature

```ts
function flatten(
	children: any,
	options?: { skipNonRendered?: boolean; doNotUnwrap?: boolean }
): any;
```

## Parameters

### `children`

* **Type:** `any`

Value or array of values to flatten

### `options`

* **Type:** `{ skipNonRendered?: boolean; doNotUnwrap?: boolean }`

* Optional

* `skipNonRendered` — drop values that won't render
  * `doNotUnwrap` — leave function children as-is (caller will resolve)

## Examples

```ts
// Custom renderer walking a children tree manually. Most authors should
// use `children()` from solid-js, which memoizes the resolved value.
function renderChildren(value: unknown): unknown {
	return flatten(value, { skipNonRendered: true });
}
```

## Learn more

* [Async reactivity](../concepts/async-reactivity.md)
* [Integrate non-Solid code](../guides/integrate-non-solid-code.md)
