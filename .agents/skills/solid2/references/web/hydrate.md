# hydrate

Attaches a Solid component tree to server-rendered DOM and returns a function that disposes the hydrated tree.

## Import

```ts
import { hydrate } from "@solidjs/web";
```

## Type signature

```ts
function hydrate(
	fn: () => JSX.Element,
	node: MountableElement,
	options?: { renderId?: string; owner?: unknown }
): () => void;
```

## Parameters

### `fn`

* **Type:** `() => JSX.Element`

Function that returns the same root JSX the server rendered.

### `node`

* **Type:** `MountableElement`

DOM node that contains the server-rendered markup.

### `options`

* **Type:** `{ renderId?: string; owner?: unknown; onError?: ClientErrorHook }`
* Optional

`renderId` must match the server's render id when one was set; `owner` parents the root under an existing owner.

## Return value

A dispose function for the hydrated tree.

## Examples

```tsx
import { hydrate } from "@solidjs/web";

const dispose = hydrate(() => <App />, document.getElementById("root")!);
```

## Caveats

* The client must render the same tree the server did. A mismatch reports a hydration error in development.
* Content in a `Portal` renders fresh on the client; the server emits nothing for it.

## Learn more

* [Hydrating server HTML](../concepts/rendering-and-ssr.md#hydrating-server-html)
* [Rendering and SSR](../concepts/rendering-and-ssr.md)
* [Choose a rendering mode](../guides/choose-a-rendering-mode.md)
