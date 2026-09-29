# @solidjs/meta

`@solidjs/meta` provides components for the document `<head>`.
Each one registers a tag with the head registry in `@solidjs/web`, so a component deep in the tree can set the title or a meta tag without a provider.
On the server the tags render into the HTML head; in the browser they update the live document.

```tsx
import { Title, Meta } from "@solidjs/meta";

function ProductPage(props: { name: string }) {
	return (
		<>
			<Title>{props.name} · Storefront</Title>
			<Meta name="description" content={`Buy ${props.name} today.`} />
			{/* ... */}
		</>
	);
}
```

[Head and metadata](../building-apps/head-and-metadata.md) shows the default-and-override pattern and what happens under server rendering.

## Components

* [`Title`](title.md) sets the document title. The last-registered `Title` wins, and unmounting it restores the previous one.
* [`Meta`](meta.md) adds a `<meta>` element; tags with the same identity (`name`, `property`, and similar attributes) replace each other.
* [`Link`](link.md) adds a `<link>` element.
* [`Stylesheet`](stylesheet.md) adds a stylesheet link.
* [`Style`](style.md) adds an inline `<style>` element.
* [`Script`](script.md) adds a `<script>` element.
* [`Base`](base.md) sets the document base URL.
* [`Head`](head.md) groups several tags into one set that replaces together.

Each page documents the component's identity rule: which earlier tag a new one replaces, and which coexist.
