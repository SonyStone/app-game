# isServer

Build-time constant that is `true` in server output and `false` in browser output.

## Import

```ts
import { isServer } from "@solidjs/web";
```

## Type signature

```ts
const isServer: boolean;
```

## Examples

```ts
import { isServer } from "@solidjs/web";

if (!isServer) {
	// Browser-only: tree-shaken out of the SSR bundle.
	window.addEventListener("resize", onResize);
}
```

```ts
if (!isServer) {
	window.addEventListener("resize", onResize);
}
```

## Caveats

* It is a build-time constant. Code behind `if (!isServer)` is removed from the server bundle, so use it rather than `typeof window` checks.

## Learn more

* [Server and client boundaries](../concepts/rendering-and-ssr.md#server-and-client-boundaries)
* [SSR-safe code](../guides/ssr-safe-code.md)
* [Rendering and SSR](../concepts/rendering-and-ssr.md)
* [Choose a rendering mode](../guides/choose-a-rendering-mode.md)
