# Context / ContextProviderComponent

Context API reference.

## Import

```ts
import type { Context, ContextProviderComponent } from "solid-js";
```

## `Context`

### Type signature

```ts
interface Context<T> extends ContextProviderComponent<T> {
	id: symbol;
	defaultValue: T | undefined;
}
```

### Properties

#### `id`

* **Type:** `symbol`

#### `defaultValue`

* **Type:** `T | undefined`

## `ContextProviderComponent`

ContextProviderComponent API reference.

### Type signature

```ts
type ContextProviderComponent<T> = FlowComponent<{ value: T }>;
```

## Learn more

* [TypeScript](../guides/typescript.md)
