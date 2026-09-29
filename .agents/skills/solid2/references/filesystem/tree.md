# filesystem-routing/tree

`filesystem-routing/tree` contains route-tree operations without Node or bundler imports.
The same exports are available from `filesystem-routing`.

## Import

```ts
import {
	buildRouteTree,
	stripRouteGroups,
	type RouteTreeEntry,
} from "filesystem-routing/tree";
```

## `RouteTreeEntry`

```ts
interface RouteTreeEntry extends RouteManifestEntry {
	id: string;
	children?: RouteTreeEntry[];
}
```

`id` records the manifest path used for nesting, including route groups.
For a nested child, `id` and `path` are relative to its parent.

## `stripRouteGroups`

```ts
function stripRouteGroups(path: string): string;
```

Removes segments matching `(name)` and collapses repeated slashes.

```ts
stripRouteGroups("/(app)/dashboard"); // "/dashboard"
stripRouteGroups("/(app)"); // "/"
```

## `buildRouteTree`

```ts
function buildRouteTree(
	entries: readonly RouteManifestEntry[]
): RouteTreeEntry[];
```

Copies and sorts entries by path length, then nests each entry under the first existing route whose `id` is its path prefix.
The function makes nested `path` values relative to the parent and removes group segments from URL paths.
The function does not mutate the input.

Pass only entries that belong in the page tree:

```ts
const tree = buildRouteTree(entries.filter((entry) => entry.page));
```
