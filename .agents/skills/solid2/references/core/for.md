# For

Creates a list of elements from a list.

Receives a map function as its child and returns a JSX element for each
list item; if the list is empty, an optional `fallback` is rendered instead.

The child callback shape follows the keying mode:

* Default / `keyed={true}` receives `(item, index)` where `item` is the raw
  row value and `index` is an accessor.
* `keyed={false}` receives `(item, index)` where `item` is an accessor and
  `index` is a stable number.
* `keyed={(item) => key}` receives accessors for both arguments.

## Import

```ts
import { For } from "solid-js";
```

## Type signature

```ts
function For<T extends readonly any[], U extends JSX.Element>(props: {
	each: T | undefined | null | false;
	fallback?: JSX.Element;
	keyed?: true;
	children: (item: T[number], index: Accessor<number>) => U;
}): JSX.Element;
function For<T extends readonly any[], U extends JSX.Element>(props: {
	each: T | undefined | null | false;
	fallback?: JSX.Element;
	keyed: false;
	children: (item: Accessor<T[number]>, index: number) => U;
}): JSX.Element;
function For<T extends readonly any[], U extends JSX.Element>(props: {
	each: T | undefined | null | false;
	fallback?: JSX.Element;
	keyed: (item: T[number]) => any;
	children: (item: Accessor<T[number]>, index: Accessor<number>) => U;
}): JSX.Element;
```

## Props

### `each`

* **Type:** `T | undefined | null | false`

The array to render. A falsy value renders the fallback.

### `fallback`

* **Type:** `JSX.Element`
* Optional

Rendered when the array is empty or falsy.

### `keyed`

* **Type:** `true | false | ((item) => any)`
* Optional

Row identity. Default `true` keys by item reference and passes the raw item with an index accessor. `false` keys by position and passes an item accessor with a stable index. A function keys by the returned value and passes accessors for both.

### `children`

* **Type:** `(item, index) => JSX.Element`

Row renderer. The argument shapes follow `keyed`; see above.

## Examples

```tsx
<For each={items} fallback={<div>No items</div>}>
	{(item, index) => <div data-index={index()}>{item.label}</div>}
</For>
```

### Key rows by a field

```tsx
// Rows keep their DOM when the server returns new objects for the same ids.
<For each={todos()} keyed={(todo) => todo.id}>
	{(todo, index) => (
		<li>
			{index() + 1}. {todo().text}
		</li>
	)}
</For>
```

## Caveats

* The default `keyed` keys rows by item reference. New object instances for the same data recreate rows; keep row identity with a stable `keyed` function or a store.
* `each` takes an array or a falsy value. Pass the accessor's value (`each={items()}`), not the accessor.

## Common problems

* [A list re-creates every row on each change](../concepts/components-and-jsx.md#a-list-re-creates-every-row-on-each-change)
* [Rows lose focus or animation when the list changes](../guides/lists.md#rows-lose-focus-or-animation-when-the-list-changes)
* [A row shows the wrong index after reordering](../guides/lists.md#a-row-shows-the-wrong-index-after-reordering)
* [Editing one item rebuilds the whole list](../guides/lists.md#editing-one-item-rebuilds-the-whole-list)

## Learn more

* [Rendering lists](../concepts/components-and-jsx.md#rendering-lists)
* [Lists](../guides/lists.md)
* [Components and JSX](../concepts/components-and-jsx.md)
* [Boundaries](../concepts/boundaries.md)
