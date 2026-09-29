# createContext

Creates a Context for sharing state with descendants of a Provider in the
component tree.

The returned `Context` is itself a provider component — pass it a `value`
prop to scope a value to its children. Read it inside descendants with
`useContext`.

Two forms:

* **`createContext<T>()`** (default-less, the canonical form). Reading via
  `useContext` outside an enclosing Provider throws `ContextNotFoundError`.
  Use this for everything that carries reactive state — signals, stores,
  `[state, actions]` tuples, services. The Provider is mandatory by
  construction; the throw makes a missing Provider a loud bug instead of a
  silent no-op. The annotation `<T>` is required because there is no value
  to infer from.
* **`createContext<T>(defaultValue)`** (default form). Reserved for the
  narrow case of contexts whose value is a primitive with a meaningful
  static fallback (theme, locale, frozen config). Outside any Provider,
  `useContext` returns `defaultValue`.

Context is for state that belongs to a subtree, which includes app-wide
state in an app that renders on the server: a value created inside a
component is created once per request, and the Provider owns and disposes
it. Module scope is shared by every request in the same process, so reserve
it for constants.

## Import

```ts
import { createContext } from "solid-js";
```

## Type signature

```ts
function createContext<T>(
	defaultValue?: T,
	options?: EffectOptions
): Context<T>;
```

## Parameters

### `defaultValue`

* **Type:** `T`
* Optional

Optional default. Only meaningful for primitive fallbacks; omit it for contexts that carry reactive state so a missing provider throws.

### `options`

* **Type:** `EffectOptions`
* Optional

`{ name }` for debugging in development

## Return value

A context object that doubles as its own provider component

## Examples

```tsx
// Reactive payload — default-less, throws if no Provider.
type TodosCtx = readonly [Store<Todo[]>, TodoActions];
const TodosContext = createContext<TodosCtx>();

function App() {
	return (
		<TodosContext value={createTodos()}>
			<TodoList />
		</TodosContext>
	);
}

function TodoList() {
	const [todos, { addTodo }] = useContext(TodosContext); // typed as TodosCtx
	// ...
	return null;
}
```

```tsx
// Primitive default — falls back to "light" outside a Provider.
const ThemeContext = createContext<"light" | "dark">("light");

function Button() {
	const theme = useContext(ThemeContext); // "light" | "dark"
	return <button class={theme}>Click</button>;
}
```

## Caveats

* Without a default, reading outside a provider throws `ContextNotFoundError`. That is intentional; add a default only for primitive fallbacks.
* For app-wide state, a module-scope signal or store is already global; context is for scoping a value to a subtree.

## Learn more

* [Context](../concepts/components-and-jsx.md#context)
* [Components and JSX](../concepts/components-and-jsx.md)

## Related types

### `ContextRecord`

```ts
type ContextRecord = Record<string | symbol, unknown>;
```
