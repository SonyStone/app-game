# provideRequestEvent

Runs a callback in a server request-event scope backed by `AsyncLocalStorage`.

## Import

```ts
import { provideRequestEvent } from "@solidjs/web/storage";
```

## Type signature

```ts
function provideRequestEvent<T extends RequestEvent, U>(
	init: T,
	cb: () => U
): U;
```

## Parameters

### `init`

* **Type:** `T`

The event for this request — frameworks pass their richer
event shapes

### `cb`

* **Type:** `() => U`

Runs synchronously; its return value is passed through

## Examples

```ts
import { provideRequestEvent } from "@solidjs/web/storage";

async function handler(request: Request) {
  return provideRequestEvent({ request, locals: {} }, () =>
    renderToStream(() => <App />)
  );
}
```

## Learn more

* [Mutations and responses](../building-apps/server-functions-mutations-and-responses.md)
* [Middleware and API routes](../building-apps/middleware-and-api-routes.md)
