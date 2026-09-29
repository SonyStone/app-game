# @solidjs/web

`@solidjs/web` is the renderer.
It turns the component tree that `solid-js` describes into DOM in the browser and into HTML on the server, and it hosts the server-side runtime for server functions and request handling.

The package has a browser build and a server build.
Bundlers pick the right one from the export map, so the same import works in both places:

```ts
import { render, hydrate, isServer } from "@solidjs/web";
```

## Rendering and SSR

[Rendering and SSR](../concepts/rendering-and-ssr.md) explains the three rendering paths and hydration.

* [`render`](render.md) mounts a tree into a DOM element and returns a dispose function.
* [`hydrate`](hydrate.md) attaches a tree to server-rendered HTML.
* [`renderToString`](render-to-string.md) renders synchronously to a string; [`renderToStream`](render-to-stream.md) streams the shell and then each boundary as it settles.
* [`httpStatus`](http-status.md) and [`httpHeader`](http-header.md) declare response metadata from inside the tree.
* [`clientOnly`](client-only.md) defers a component to the browser.
* [`isServer`](is-server.md) and [`isDev`](is-dev.md) are build-time constants.

## Head

* [`useHead`](use-head.md) registers tags with the ambient head registry; [`HeadTag`](head-tag.md) describes them.
* [`@solidjs/meta`](../meta/overview.md) wraps the registry in components; [Head and metadata](../building-apps/head-and-metadata.md) shows both.

## Components

* [`Portal`](portal.md) renders children elsewhere in the document.
* [`dynamic`](dynamic.md) creates a component from a reactive source.

## JSX properties

Attributes with renderer-specific behavior: [`ref`](ref.md), [`class`](class.md), [`style`](style.md), [`textContent`](text-content.md), and [`innerHTML`](inner-html.md).

## Server functions

The runtime behind `"use server"`: declarations such as [`GET`](get.md) and [`live`](live.md), per-call [`invoke`](invoke.md) options, and the host integration hooks.
The [Server functions index](server-functions.md) groups them; the [Server functions guide](../building-apps/server-functions.md) covers application patterns.

## Request and response

Working with the request on the server: [`getRequestEvent`](get-request-event.md), the response helpers [`respond`](respond.md), [`redirect`](redirect.md), and [`reload`](reload.md), [cookies](cookies.md), [safe errors](safe-errors.md), and [`getTraceContext`](get-trace-context.md) for the request's W3C trace.
The [Request and response index](request-response.md) lists them all.

## Performance tracks

[`enablePerformanceTracks`](enable-performance-tracks.md) from `@solidjs/web/performance-tracks` paints the attribution engine's records and the runtime's server-function calls as tracks in the Chrome Performance panel; [Performance](../guides/performance.md#see-the-records-on-the-performance-panel) shows how to read them.
