# NotReadyError

Represents a read from an async reactive source before its first value is ready. Application code should normally let `Loading` and `Errored` boundaries handle this control flow.

## Import

```ts
import { NotReadyError } from "solid-js";
```

## Type signature

```ts
class NotReadyError extends Error {
	readonly source: unknown;
}
```

## Examples

```ts
// Advanced: distinguish "not ready yet" from a real error in custom
// boundary plumbing. App code should rely on `<Loading>` / `<Errored>`.
try {
	const value = readReactiveSource();
} catch (err) {
	if (err instanceof NotReadyError) throw err; // re-throw to suspend
	reportError(err);
}
```

## Learn more

* [Async reactivity](../concepts/async-reactivity.md)
* [Integrate non-Solid code](../guides/integrate-non-solid-code.md)
