# Server functions

`@solidjs/web/server-functions` provides the runtime used by functions compiled with `"use server"`.
The package resolves to a browser transport in client builds and a dispatcher in server builds.
Shared declarations such as `GET`, `live`, `withMeta`, and `invoke` have matching types in both environments.

Start with the [server functions guide](../building-apps/server-functions.md) for application patterns.
Use the integration pages in this section when building a router, development tool, or custom server host.

## Declarations and calls

* [`GET()`](get.md) declares an HTTP read.
* [`live()`](live.md) declares a reconnecting value stream.
* [`invoke()`](invoke.md) supplies per-call Fetch options.
* [Metadata APIs](metadata.md) attach and inspect declaration metadata.

## Runtime configuration

* [`configureServerFunctionsClient()`](configure-client.md) configures the browser endpoint, codec, and request policy.
* [`enableRichArguments()`](rich-arguments.md) enables arguments that JSON cannot preserve.
* [Host configuration](host-configuration.md) documents the server dispatcher and policy hooks.
* [Invocation context](invocation-context.md) identifies the current server-function call.

## Integration protocols

* [Addressing](addressing.md) builds and parses server-function URLs.
* [Progressive enhancement](progressive-enhancement.md) handles requests made without the client runtime.
* [Single-flight data](single-flight.md) lets a router fold refreshed data into a mutation response.
* Server-function calls and executions arrive as records on [`OBSERVE.records`](../core/observe.md) in the observe build; see [Observability](../guides/observability.md).

The configuration hooks and wire decoders are integration-tier APIs.
Application code normally uses a generated reference, the response helpers in `@solidjs/web`, and an optional router data layer.

Server components and the `@solidjs/web/frames` transport remain experimental.
They are not part of the stable server-function reference.
