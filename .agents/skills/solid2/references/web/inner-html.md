# innerHTML

`innerHTML` parses an HTML string as an element's complete contents.
Use it for trusted markup or for untrusted markup that has passed through an HTML sanitizer.

## Type

```ts
innerHTML?: string;
```

`innerHTML` is available on intrinsic DOM elements.
It does not require an import.

## Usage

```tsx
import { createMemo } from "solid-js";

const html = createMemo(() => sanitize(renderMarkdown(props.source)));

return <article innerHTML={html()} />;
```

A reactive expression replaces the element's parsed contents when its value changes.
Nodes created from the previous value do not keep their identity or state.

## Security

Solid does not escape or sanitize an `innerHTML` value.
During server rendering, Solid also writes the value into the response as raw HTML.

Do not pass user-controlled content directly:

```tsx
// Avoid: an attacker can inject markup or executable content.
<article innerHTML={comment.body} />
```

Use a sanitizer that matches the markup and URL policies of your application before passing untrusted content to `innerHTML`.
Use [`textContent`](text-content.md) when the value should render as plain text.

## Children

Do not combine `innerHTML` with JSX children.
Both define the element's complete contents, so their updates can replace each other.
