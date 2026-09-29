# markSafeError / isSafeError

Marks `error` as safe to serialize to the client verbatim, opting it out
of production error sanitization (see `handleServerFunctionRequest`). Use
for errors whose message/properties are intentional client-facing content.
Returns the same value for convenient `throw markSafeError(new Error(...))`.

## Import

```ts
import { markSafeError, isSafeError } from "@solidjs/web";
```

## `markSafeError`

### Type signature

```ts
function markSafeError<E>(error: E): E;
```

### Parameters

#### `error`

* **Type:** `E`

### Common problems

* [`respond()` reaches the client as `Internal Server Error`](../guides/forms.md#respond-reaches-the-client-as-internal-server-error)

## `isSafeError`

Returns whether a value is branded as safe to serialize to a client.

### Type signature

```ts
function isSafeError(value: unknown): value is Error;
```

### Parameters

#### `value`

* **Type:** `unknown`

## Learn more

* [Arguments and security](../building-apps/server-functions-arguments-and-security.md)
* [Forms](../guides/forms.md)
* [Mutations and responses](../building-apps/server-functions-mutations-and-responses.md)
* [Middleware and API routes](../building-apps/middleware-and-api-routes.md)
