# isDev

Build-time constant that is `true` in development output and `false` in production output.

## Import

```ts
import { isDev } from "@solidjs/web";
```

## Type signature

```ts
const isDev: boolean;
```

## Examples

```ts
import { isDev } from "@solidjs/web";

if (isDev) {
	console.warn("debug-only path");
}
```

```ts
if (isDev) {
	console.warn("Development-only diagnostic");
}
```

## Caveats

* It is a build-time constant. Code behind `if (isDev)` is removed from production output.

## Learn more

* [Rendering and SSR](../concepts/rendering-and-ssr.md)
* [Choose a rendering mode](../guides/choose-a-rendering-mode.md)
