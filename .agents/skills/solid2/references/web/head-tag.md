# HeadTag

`HeadTag` describes one tag for [`useHead`](use-head.md).

## Import

```ts
import type { HeadTag } from "@solidjs/web";
```

## Type signature

```ts
type HeadTag = {
	tag: "title" | "meta" | "link" | "style" | "script" | "base";
	props: Record<string, any>;
	key?: string | (() => string);
};
```

## Properties

### `tag`

The head element to register.
`noscript` is not part of the descriptor union; author it statically in the document shell.

### `props`

Attributes and text content for the tag.
Values can be reactive getters.
Use `children` for the text body of `title`, `style`, or inline `script` descriptors.

Descriptors are data rather than managed DOM elements.
Do not attach refs or event handlers.

### `key`

Overrides the built-in replacement identity.
The value can be a string or a reactive getter.

`title` remains a document-wide singleton and cannot be forked with a key.
For other replaceable tags, use a key to make otherwise different tags replace each other or to keep otherwise matching tags independent.

## Example

```tsx
const description: HeadTag = {
	tag: "meta",
	key: "page-description",
	props: {
		name: "description",
		content: () => summary(),
	},
};

useHead(description);
```

## Related

* [`useHead`](use-head.md)
* [Head and metadata](../building-apps/head-and-metadata.md)
