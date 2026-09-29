# createUniqueId

Returns a stable id string that matches between server-rendered and
client-hydrated trees. Use it for `<label for>`, `aria-labelledby`, and
other attributes that need consistent ids across SSR.

## Import

```ts
import { createUniqueId } from "solid-js";
```

## Type signature

```ts
function createUniqueId(): string;
```

## Return value

A string id that matches between the server-rendered and hydrated trees.

## Examples

```tsx
function Field(props: { label: string }) {
	const id = createUniqueId();
	return (
		<>
			<label for={id}>{props.label}</label>
			<input id={id} />
		</>
	);
}
```

## Caveats

* Call it in a component body or another owned scope so the server and client generate the same id.

## Learn more

* [Components and JSX](../concepts/components-and-jsx.md)
