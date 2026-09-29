# reload

Creates an empty `Response` that asks the client to revalidate the named cache keys without navigating.

## Import

```ts
import { reload } from "@solidjs/web";
```

## Type signature

```ts
function reload(init?: ResponseHelperInit): Response;
```

## Parameters

### `init`

* **Type:** `ResponseHelperInit`
* Optional

## Examples

```ts
return reload({ revalidate: "todos" });
```

## Common problems

* [The form submits, but the page reloads instead of staying put](../guides/forms.md#the-form-submits-but-the-page-reloads-instead-of-staying-put)

## Learn more

* [Mutations and responses](../building-apps/server-functions-mutations-and-responses.md)
* [Middleware and API routes](../building-apps/middleware-and-api-routes.md)

## Related types

### `ResponseHelperInit`

`ResponseInit` accepted by the response helpers, plus `revalidate`.

```ts
interface ResponseHelperInit extends ResponseInit {
	revalidate?: string | string[];
}
```

#### `revalidate`

* **Type:** `string | string[]`

The cache keys the mutation invalidated, sent as the `X-Revalidate`
header for the client's integrations to apply. Three declarations, three
scopes: omitted sends no header — the host's default (Solid Router
revalidates everything after an action; a router without that
convention reloads only what it owns); an empty list sends an empty
header — nothing, explicitly; `REVALIDATE_ALL` (`"*"`) — every entry,
whatever the host's default. How named keys are matched (prefixes,
namespaces) is each integration's business.
