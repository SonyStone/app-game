# NoHydration

Disables hydration for its children on the client.
During hydration, skips the subtree entirely (returns undefined so DOM is left untouched).
After hydration, renders children fresh.

## Import

```ts
import { NoHydration } from "solid-js";
```

## Type signature

```ts
function NoHydration(props: { children: JSX.Element }): JSX.Element;
```

## Props

### `children`

* **Type:** `JSX.Element`

## Examples

```tsx
// Mount a client-only widget that the server didn't render. The subtree
// is left empty during hydration, then renders fresh once hydration ends.
<NoHydration>
	<ClientOnlyMap />
</NoHydration>
```

## Learn more

* [Controlling hydration](../concepts/rendering-and-ssr.md#controlling-hydration)
