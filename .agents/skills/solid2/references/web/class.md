# class

The `class` prop sets an element's class names.
It accepts a string, an object of conditional names, or a nested array that combines class values.

## Type

```ts
type ClassValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| Record<string, boolean>
	| ClassValue[];
```

## String values

A string supplies the complete class attribute:

```tsx
<button class="button primary">Save</button>
```

A reactive string replaces the complete value when it changes.

## Conditional classes

An object adds each key whose value is truthy:

```tsx
<button
	class={{
		active: props.active,
		"saving muted": props.saving,
	}}
>
	Save
</button>
```

A key can contain several space-separated class names.
Solid toggles the affected class tokens when their conditions change.

## Merge class values

An array combines strings, objects, and other arrays:

```tsx
function Button(props: { class?: string; active: boolean; saving: boolean }) {
	return (
		<button
			class={[
				"button",
				props.class,
				{
					active: props.active,
					"saving muted": props.saving,
				},
			]}
		>
			Save
		</button>
	);
}
```

Use the array form to combine a component's base classes, caller-provided classes, and conditional classes.
Solid recursively flattens nested arrays.

The `classList` prop from Solid 1 is replaced by the object and array forms of `class`.
