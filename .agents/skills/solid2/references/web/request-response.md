# Request and response

`@solidjs/web` owns the web-standard request and response values used by server rendering, middleware, actions, and server functions.

* [`getRequestEvent()`](get-request-event.md) reads the current request, local values, and response stub.
* [`provideRequestEvent()`](provide-request-event.md) establishes request context in a Node server or test.
* [`respond()`](respond.md) pairs a value with status, headers, or revalidation metadata.
* [`redirect()`](redirect.md) creates redirect control flow.
* [`reload()`](reload.md) requests data revalidation.
* [Safe errors](safe-errors.md) mark intentional client-facing `Error` values.
* [Cookie codecs](cookies.md) parse and serialize cookie header values.

See [Middleware and API routes](../building-apps/middleware-and-api-routes.md) for request handling and [server functions](../building-apps/server-functions.md) for RPC patterns.
