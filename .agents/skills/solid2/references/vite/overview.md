# @solidjs/vite-plugin

`@solidjs/vite-plugin` 3.0 provides the Solid JSX transform, optional start mode, and `"use server"` compilation for Solid 2.0.

## Package exports

### `@solidjs/vite-plugin`

* [`default: solidPlugin(options?)`](options.md) returns the Vite plugin array.
* [`serverFunctions(options?)`](server-functions.md) returns the standalone server-function plugin array.
* [`devStylePatch`](modules.md) is the development style de-duplication script.
* [`Options`, `Compiler`, `ExtensionOptions`, `RefreshOptions`, and `SolidOptions`](options.md) describe transform configuration.
* [`StartOptions`](start.md) describes start mode.
* [`ServerFunctionsOptions` and `ServerFunctionsFilter`](server-functions.md) describe server-function compilation and dispatch.
* [`ViteManifest`](modules.md) describes the asset manifest consumed by server rendering.

### `@solidjs/vite-plugin/virtual-solid-manifest`

Adds TypeScript declarations for the plugin's [virtual modules](modules.md).

### `@solidjs/vite-plugin/boundary-modules`

Adds TypeScript declarations for the [`server-only` and `client-only` marker modules](modules.md#boundary-marker-modules).

## Minimal configuration

```ts
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";

export default defineConfig({
	plugins: [solid()],
});
```

The default export returns an array.
Pass `solidPlugin()` directly as an item in Vite's `plugins` array.
Vite flattens nested plugin arrays.
