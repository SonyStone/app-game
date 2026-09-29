# createErrorBoundary

Lower-level primitive that backs the `<Errored>` flow control. Catches
thrown errors inside `fn` and invokes `fallback(error, reset)` instead.
`error` is an accessor for the latest captured error; `reset()` recomputes
the failing sources so the boundary can attempt to recover.

App code should use `<Errored fallback={...}>` instead — reach for this only
when authoring custom boundary components.

## Import

```ts
import { createErrorBoundary } from "@solidjs/signals";
```

## Type signature

```ts
function createErrorBoundary<T, U>(
	fn: () => T,
	fallback: (error: Accessor<unknown>, reset: () => void) => U
): Accessor<T | U>;
```

## Parameters

### `fn`

* **Type:** `() => T`

### `fallback`

* **Type:** `(error: Accessor<unknown>, reset: () => void) => U`

## Examples

```tsx
// Custom boundary that wraps the primitive and adds telemetry.
function TracedErrored(props: {
	fallback: (e: () => unknown) => JSX.Element;
	children: JSX.Element;
}) {
	return createErrorBoundary(
		() => props.children,
		(err, reset) => {
			reportError(err());
			return props.fallback(err);
		}
	) as unknown as JSX.Element;
}
```

## Learn more

* [Primitive forms](../concepts/boundaries.md#primitive-forms)
