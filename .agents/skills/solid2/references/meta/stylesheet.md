# Stylesheet

`Stylesheet` is sugar for [`<Link rel="stylesheet">`](link.md).

## Import

```tsx
import { Stylesheet } from "@solidjs/meta";
```

## Type

```tsx
const Stylesheet: Component<
	Omit<JSX.LinkHTMLAttributes<HTMLLinkElement>, "rel"> & { key?: string }
>;
```

## Props

Accepts attributes for [`<link>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/link) except `rel`, which is fixed to `stylesheet`.

### `key`

* **Type:** `string`
* **Optional:** Yes

Overrides the default identity used for deduplication.

## Behavior

* Emitted eagerly: during SSR the stylesheet streams as soon as it registers, so styles load as early as possible.
* Removed when its owner disposes — navigating away from a route removes its route-scoped stylesheet.
* Dedupes by URL: registering the same `href` twice yields one element.

## Examples

### Route-scoped stylesheet

```tsx
import { Stylesheet } from "@solidjs/meta";

export default function Dashboard() {
	return <Stylesheet href="/styles/dashboard.css" />;
}
```

## Related

* [`Link`](link.md)
* [`Style`](style.md)
