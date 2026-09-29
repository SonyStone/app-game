# GET

Declares that a server-function read can use HTTP GET. Calls use a cacheable URL when the encoded arguments fit and fall back to a read-only POST when they do not.

> See [Reads, streams, and live data](../building-apps/server-functions-reads-and-live-data.md) for caching, URL limits, and HEAD behavior.

## Import

```ts
import { GET } from "@solidjs/web/server-functions";
```

## Type signature

```ts
function GET<A extends readonly any[], R>(
	fn: (...args: A) => R
): ServerFunction<A, Awaited<R>>;
```

## Parameters

### `fn`

* **Type:** `(...args: A) => R`

## Examples

```ts
export const getUser = GET(async (id: string) => {
	"use server";
	return database.users.find(id);
});
```

## Common problems

* [`action` is not a function, or the form attribute renders as source code](../guides/forms.md#action-is-not-a-function-or-the-form-attribute-renders-as-source-code)

## Learn more

* [Reads, streams, and live data](../building-apps/server-functions-reads-and-live-data.md)
* [Server functions](../building-apps/server-functions.md)
