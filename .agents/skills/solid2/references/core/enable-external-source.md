# enableExternalSource

Registers an adapter that lets Solid track reads from a non-Solid reactive system, such as MobX or Vue reactivity, inside its computations.

## Import

```ts
import { enableExternalSource } from "solid-js";
```

## Type signature

```ts
function enableExternalSource(config: ExternalSourceConfig): void;
```

## Parameters

### `config`

* **Type:** `ExternalSourceConfig`

## Learn more

* [Feed an outside source into the graph](../guides/integrate-non-solid-code.md#feed-an-outside-source-into-the-graph)
* [Async reactivity](../concepts/async-reactivity.md)
* [Integrate non-Solid code](../guides/integrate-non-solid-code.md)

## Related types

### `ExternalSource`

```ts
interface ExternalSource {
	track: (prev: any) => any;
	dispose: () => void;
}
```

#### `track`

* **Type:** `(prev: any) => any`

#### `dispose`

* **Type:** `() => void`

### `ExternalSourceConfig`

```ts
interface ExternalSourceConfig {
	factory: ExternalSourceFactory;
	untrack?: <T>(fn: () => T) => T;
}
```

#### `factory`

* **Type:** `ExternalSourceFactory`

#### `untrack`

* **Type:** `<T>(fn: () => T) => T`

### `ExternalSourceFactory`

```ts
type ExternalSourceFactory = (
	fn: (prev: any) => any,
	trigger: () => void
) => ExternalSource;
```
