# children

Resolves a `children` accessor and exposes the result as an accessor with
a `.toArray()` helper. Use this when a component needs to inspect or
iterate over its children rather than only render them through.

## Import

```ts
import { children } from "solid-js";
```

## Type signature

```ts
function children(fn: Accessor<JSX.Element>): ChildrenReturn;
```

## Parameters

### `fn`

* **Type:** `Accessor<JSX.Element>`

Accessor for the raw children, usually `() => props.children`.

## Return value

An accessor of the resolved children, with `.toArray()` for iteration

## Examples

```tsx
function List(props: { children: Element }) {
	const items = children(() => props.children);
	return (
		<ul>
			{items.toArray().map((item) => (
				<li>{item}</li>
			))}
		</ul>
	);
}
```

## Caveats

* Call it once in the component body and read the result. Calling `props.children` in several places creates the children several times.
* The accessor resolves lazily; the first read happens where the result is inserted or `toArray()` is called.

## Common problems

* [A child does not update when the parent's signal changes](../concepts/components-and-jsx.md#a-child-does-not-update-when-the-parents-signal-changes)

## Learn more

* [Children and composition](../concepts/components-and-jsx.md#children-and-composition)
* [Components and JSX](../concepts/components-and-jsx.md)

## Related types

### `ChildrenReturn`

```ts
type ChildrenReturn = Accessor<ResolvedChildren> & {
	toArray: () => ResolvedElement[];
};
```

### `ResolvedChildren`

```ts
type ResolvedChildren = ResolvedElement | ResolvedElement[];
```
