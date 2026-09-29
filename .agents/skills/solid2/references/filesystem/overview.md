# filesystem-routing

`filesystem-routing` scans route files into a router-neutral manifest.
Vite delivers that manifest, while each router owns its conversion to router-specific definitions.

## Package exports

### `filesystem-routing`

* [`PageFileSystemRouter`, `FlatFileSystemRouter`, and filename helpers](conventions.md)
* [`BaseFileSystemRouter`, scanning utilities, module analysis, and manifest types](core.md)
* [`buildRouteTree`, `stripRouteGroups`, and `RouteTreeEntry`](tree.md)

### `filesystem-routing/tree`

Exports the [tree-building functions and type](tree.md) without loading the scanner.

### `filesystem-routing/vite`

Exports [`fileRoutes(options?)`](vite.md), its option type, and lower-level Vite adapter helpers.

### `filesystem-routing/api`

Exports the [API matcher and fetch-style middleware adapter](api.md).

### `filesystem-routing/types`

Provides the ambient declaration for [`virtual:file-routes`](manifest.md).

### `virtual:file-routes`

The generated module exports the flat manifest as default and nested page entries as `pageRoutes`.
See [Manifest module](manifest.md).

## Solid Router boundary

`filesystem-routing` does not export a Solid Router adapter.
Import `fileRoutes` from `@solidjs/router/fs` to convert `pageRoutes` into Solid Router route definitions.

```tsx
import { pageRoutes } from "virtual:file-routes";
import { createRouter } from "@solidjs/router";
import { fileRoutes } from "@solidjs/router/fs";

const Router = createRouter({ routes: fileRoutes(pageRoutes) });
```
