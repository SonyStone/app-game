# Accessor / Setter / Signal / SourceAccessor

A zero-arg getter for a reactive value. Calling it inside a tracking scope
(memo, effect compute, JSX expression) subscribes the scope to changes.

Reading outside any tracking scope returns the current value without
creating a subscription.

## Import

```ts
import type { Accessor, Setter, Signal, SourceAccessor } from "solid-js";
```

## `Accessor`

### Type signature

```ts
type Accessor<T> = () => T;
```

## `Setter`

A signal setter. Accepts either a new value or an updater `(prev) => next`.

If the type permits `undefined`, `setState()` (no args) clears to `undefined`.

To store a function as the value itself (rather than as an updater), wrap it
with an updater: `setHandler(() => myHandler)`.

### Type signature

```ts
type Setter<in out T> = {
	<U extends T>(
		...args: undefined extends T
			? []
			: [value: Exclude<U, Function> | ((prev: T) => U)]
	): undefined extends T ? undefined : U;
	<U extends T>(value: (prev: T) => U): U;
	<U extends T>(value: Exclude<U, Function>): U;
	<U extends T>(value: Exclude<U, Function> | ((prev: T) => U)): U;
};
```

## `Signal`

A `[get, set]` pair returned from `createSignal` / `createOptimistic`.

### Type signature

```ts
type Signal<T> = [get: SourceAccessor<T>, set: Setter<T>];
```

## `SourceAccessor`

The getter `createSignal` and `createMemo` return: an `Accessor<T>` carrying the `Refreshable` brand, which is what lets [`refresh()`](refresh.md) accept it. A plain `Accessor<T>` parameter accepts a `SourceAccessor<T>`; the reverse does not hold.

### Type signature

```ts
type SourceAccessor<T> = Refreshable<Accessor<T>>;
```

## Learn more

* [Signals, memos, and setters](../guides/typescript.md#signals-memos-and-setters)
* [TypeScript](../guides/typescript.md)
