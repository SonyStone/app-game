# lazy

Defines a code-split component. The returned component triggers its dynamic
import on first render and suspends through any enclosing `<Loading>`
boundary while the chunk is in flight. Call `.preload()` to start the
import early (e.g. on hover).

## Import

```ts
import { lazy } from "solid-js";
```

## Type signature

```ts
function lazy<M extends Record<string, any>, K extends keyof M & string>(
	fn: () => Promise<M>,
	options: { export: K },
	moduleUrl?: string
): M[K] & { preload: () => Promise<M>; moduleUrl?: string };
function lazy<T extends Component<any>>(
	fn: () => Promise<{ default: T }>,
	options?: { export?: string },
	moduleUrl?: string
): T & { preload: () => Promise<{ default: T }>; moduleUrl?: string };
```

## Parameters

### `fn`

* **Type:** `() => Promise<M> | () => Promise<{ default: T }>`

Dynamic import that resolves the component's module.

### `options`

* **Type:** `{ export: K } | { export?: string }`
* Optional

`{ export }` names which export of the module is the component. Defaults to `default`.

### `moduleUrl`

* **Type:** `string`
* Optional

Module specifier injected by the bundler integration. Exposed as the component's `moduleUrl` property and used in hydration error messages.

## Return value

A component with the same props as the imported one, plus a `preload()` method that starts the import early.

## Examples

```tsx
const Profile = lazy(() => import("./Profile"));
const About = lazy(() => import("./pages"), { export: "About" });

function App() {
	return (
		<Loading fallback={<Spinner />}>
			<Profile id="42" />
		</Loading>
	);
}

// Preload before the user clicks
<button onMouseEnter={() => Profile.preload()}>Open profile</button>;
```

## Caveats

* The import runs on first render, not at definition. Wrap the component in a `Loading` boundary or the nearest boundary shows its fallback.
* By default the component must be the module's default export. Use `{ export: "Name" }` for a named export; a runtime wrapper that selects one breaks hydration.

## Learn more

* [Loading boundaries](../concepts/boundaries.md#loading-boundaries)
* [Components and JSX](../concepts/components-and-jsx.md)
