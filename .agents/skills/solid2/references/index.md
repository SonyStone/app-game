# Documentation index

Complete Solid 2 documentation. Each page appears once below.

Attribution: Solid documentation authors and contributors, solidjs/solid-docs.
Original prose, examples, tables, callouts, and diagrams are preserved; internal links point to local copies.
Capture metadata and content hashes are in `manifest.json`. Generated pages and this index are maintained by `scripts/sync_docs.py`.


## Overview

- [Overview](overview/index.md): What Solid is, what these docs cover, and where to start reading.
- [Glossary](overview/glossary.md): Solid's own words, each defined in a few sentences and linked to the page that teaches it.
- [Reference](overview/reference.md): API reference for Solid: the reactive core, the web renderer, Solid Router, Solid Meta, the Vite plugin, and filesystem routing.

## Getting started

- [Quick start](getting-started/quick-start.md): Go from an empty directory to a running Solid app with a change of your own in it, and meet the ideas the rest of the docs build on.
- [Project shapes](getting-started/project-shapes.md): Pick between the bare, basic, and fullstack templates by what your app needs on day one, knowing that moving up later changes configuration, not your code.

## Concepts

- [Reactivity](concepts/reactivity.md): Signals, memos, and effects: how Solid tracks reads, why a component runs once, and how to tell when a value will update.
- [Components and JSX](concepts/components-and-jsx.md): Components as functions that run once: props, children, control flow, refs, and the JSX rules that follow from that.
- [Stores](concepts/stores.md): Hold a cart, a form, or any nested object in a store: update one property through a draft, derive filtered views with a projection, and load server data into the same proxy.
- [Async reactivity](concepts/async-reactivity.md): Read a promise like a value: how async memos hold updates, when Loading shows a fallback, and how mutations settle.
- [Boundaries](concepts/boundaries.md): Decide which part of the page shows a spinner, which part shows an error, and in what order regions appear, by placing Loading, Errored, and Reveal around the right subtree.
- [Mutations](concepts/mutations.md): Move the cart's add, remove, and set-quantity writes to a server without changing the UI: actions, optimistic stores, refresh, and how a failed request undoes itself.
- [Rendering and SSR](concepts/rendering-and-ssr.md): Run the same components in the browser and on the server: keep browser-only code off the server, get matching HTML for hydration, and choose between string and streaming rendering.

## Building apps

- [App structure](building-apps/app-structure.md): Know which two files in a start-mode project you edit, what the plugin generates around them, and when to replace a generated entry or hook a router into the server render.
- [Styling and assets](building-apps/styling-and-assets.md): Style a component with global CSS, a CSS module, Tailwind, or an inline style object, toggle classes without string building, and reference images so the built URL is hashed.
- [Head and metadata](building-apps/head-and-metadata.md): Give each page its own title and meta tags from the component that owns them, let a layout's defaults return when the page unmounts, and read a title from data that is still loading.
- [Server functions](building-apps/server-functions.md): Move a database query or a secret out of the browser by marking a function with "use server", and recognize what that call becomes on the wire.
- [Reads, streams, and live data](building-apps/server-functions-reads-and-live-data.md): Declare a product read that HTTP caches can store, stream order events from a server function, and keep a stock level connected when another shopper changes it.
- [Arguments and security](building-apps/server-functions-arguments-and-security.md): Send arguments a server function can decode, and validate and authorize every call as if it came from a terminal, because it can.
- [Mutations and responses](building-apps/server-functions-mutations-and-responses.md): Return a value, a redirect, a reload, or a 400 from a cart or account mutation, and control what a thrown error reveals in production.
- [Metadata and transport](building-apps/server-functions-metadata-and-transport.md): Read a server-function request in the network tab, attach a header to every call, move the endpoint, and cancel one call in flight.
- [Progressive enhancement](building-apps/server-functions-progressive-enhancement.md): Make the Add to cart form post to a server function before JavaScript loads, and know which part of that exchange core owns and which the router adds.
- [Sessions and auth](building-apps/sessions-and-auth.md): Build a signed cookie session on the request event, sign customers in and out from server functions, and authorize every server entry point against that session.
- [Environment](building-apps/environment.md): Declare environment variables once, read secrets on the server and public values in the browser through typed modules, and let the build fail when a secret would leak.
- [Middleware and API routes](building-apps/middleware-and-api-routes.md): Run code in front of every request with fetch-style middleware, share state with pages and server functions through the request event, and answer HTTP requests from route modules.
- [Deployment](building-apps/deployment.md): Put a start-mode build on a host: serve dist/client as static files, route everything else to the built request handler, supply the server environment at boot, and pick a Node server or a provider adapter.

## Routing guides

- [Routing overview](routing/overview.md): Choose between Solid Router and TanStack Router for a Solid app, mount the router in App, and decide whether routes come from an array or from files under src/routes.
- [Solid Router](routing/solid-router.md): Build a small routed store with Solid Router: a product page that reads its id from the URL, a header that stays mounted, typed links, and route data that starts loading before the page renders.
- [Setup](routing/solid-router-setup.md): Add Solid Router to a project that does not have it, mount one router at the application root, and set the options for a base path, hash history, or preloading.
- [Route definitions](routing/solid-router-route-definitions.md): Write the route objects Solid Router matches against: path patterns with required, optional, and wildcard segments, typed parameters, match filters, metadata, lazy subtrees, and the file-system manifest.
- [Nested routes and layouts](routing/solid-router-nested-routes.md): Wrap a group of pages in a shared layout, keep it mounted while pages change, share parameters down the tree, and load data at every level without a waterfall.
- [Navigation and typed paths](routing/solid-router-navigation.md): Link between pages with plain anchors, build URLs the compiler checks, navigate from code, read the location and search parameters, show active and pending links, and guard against leaving a page.
- [Data loading and mutations](routing/solid-router-data.md): Start route data early with preloads, cache and share reads with query, submit mutations with actions, show optimistic state, and control what revalidates.
- [Server rendering and hydration](routing/solid-router-server-rendering.md): Render Solid Router on the server: read the URL from the request, hydrate query results without a second fetch, return fresh data from a mutation in one round trip, and keep forms working without JavaScript.
- [TanStack Router](routing/tanstack.md): Use TanStack Router and TanStack Query with Solid's server functions, streaming SSR, and single-flight mutations, as the fullstack-tanstack project shape does.
- [Integrate a router](routing/integrate-a-router.md): Wire a router that Solid does not ship into start mode: give it the request URL and a per-request instance, and connect it to the single-flight mutation transport.

## Guides

- [Thinking in Solid](guides/thinking-in-solid.md): Build the storefront's product search end to end, and at each step see what a React or Vue developer would reach for and what Solid does instead.
- [Avoid unnecessary effects](guides/avoid-unnecessary-effects.md): Recognize the effect that copies one reactive value into another, replace it with a direct, memoized, async, or writable derivation, and keep createEffect for the imperative boundary.
- [Custom primitives](guides/custom-primitives.md): Move repeated reactive setup into a createX function that runs inside an owner, accepts accessors, returns accessors, cleans up what it starts, and stays correct during server rendering.
- [State management](guides/state-management.md): Decide where each piece of storefront state lives: a component, a context provider, the URL, or the server, and keep it out of module scope in code that also runs on the server.
- [Forms](guides/forms.md): Build a form with a server function and a Solid Router action: it works before JavaScript loads, validates on the server, and after hydration shows pending state, inline errors, and the saved result before the server confirms.
- [Lists](guides/lists.md): Render, edit, filter, sort, select in, and window lists without rebuilding rows, and read the diagnostics that tell you when you are.
- [Data fetching patterns](guides/data-fetching-patterns.md): Load data for search, detail pages, pagination, shared state, and dashboards without loading flags, request counters, or abort controllers, and decide where each request and each boundary goes.
- [Protected routes](guides/protected-routes.md): Require a signed-in customer for the account area at the data, route, and request layers, redirect a signed-out visitor to sign-in on the server and in the browser, and send them back where they were going.
- [SSR-safe code](guides/ssr-safe-code.md): Keep browser APIs, per-run values, and client-only data out of the server render, and read each hydration warning to find the line that made the server and the browser disagree.
- [Choose a rendering mode](guides/choose-a-rendering-mode.md): Decide between a static shell, streaming server rendering, and build-time prerendering for a start-mode project, and what each one costs.
- [Debugging reactivity](guides/debugging-reactivity.md): Find out why a value does not update, why it updates too often, and how to read Solid's development diagnostics.
- [Performance](guides/performance.md): Measure a slow catalog page with the browser profiler and Solid's attribution tables, then fix the cause each measurement points at: hot derivations, wide writes, rebuilt rows, waterfalls, unsplit code, and a blocked streaming shell.
- [TypeScript](guides/typescript.md): Replace the any annotations in a storefront with the types Solid exports for props, children, accessors, store drafts, event handlers, refs, server function results, and typed routes.
- [Integrate non-Solid code](guides/integrate-non-solid-code.md): Drive a charting library, a map, a web component, or an analytics script from Solid state: get the DOM node at the right time, create the instance once, update it in an effect, and keep browser-only imports off the server.
- [Testing](guides/testing.md): Write a component test that clicks a button and asserts the label, run it in jsdom or a real browser, and test fullstack server code in a separate Node project.
- [Observability](guides/observability.md): Report the errors your boundaries catch in production, follow a request from the server into the browser, and see what each user interaction cost, without wrapping a component.
- [Build an observability adapter](guides/observability-adapters.md): Connect an error monitor or a tracing SDK to a Solid app through the runtime's hooks and channels, with nothing wrapped, patched, or rewritten.

## Migration

- [From Solid 1.x](migration/from-solid-1.md): Migrate a Solid 1.x application to Solid 2, including package imports, reactivity, effects, stores, async data, rendering, and tests.
- [Data fetching from Solid 1](migration/data-fetching-from-solid-1.md): Move Solid 1 data loading patterns to async computations one fetch at a time, and decide per fetch whether an update should wait, dim, or show a placeholder.
- [From SolidStart](migration/from-solid-start.md): Move a SolidStart 1 or released SolidStart 2 application to Solid 2 through @solidjs/vite-plugin start mode.
- [From Solid Router 0.x/1.x](migration/from-solid-router.md): Migrate JSX routes and the Solid Router 0.x/1.x data APIs to a Solid Router 2 createRouter instance.
- [From Solid Meta 0.x](migration/from-solid-meta.md): Migrate your application from @solidjs/meta 0.x to 1.0.
- [From React](migration/from-react.md): Map familiar React concepts to their closest Solid concepts, with equivalent examples and the semantic differences that matter during migration.

## Core API

- [solid-js](core/overview.md): Reference for the solid-js package: reactive primitives, stores, actions, context, flow components, and the public types.

### Reactivity

- [createEffect](core/create-effect.md): Creates a reactive effect with separate compute and effect phases.
- [createMemo](core/create-memo.md): Creates a readonly derived reactive memoized signal.
- [createOptimistic](core/create-optimistic.md): Creates an optimistic signal — a `Signal<T>` whose writes are tentative inside an `action`: they show up immediately, then auto-revert (or reconcile to the action's resolved value) once the pending work settles.
- [createSignal](core/create-signal.md): Creates a simple reactive state with a getter and setter.
- [flush](core/flush.md): Synchronously processes the pending reactive queue, or runs `fn` in a synchronous flush scope before draining the queue.
- [isPending](core/is-pending.md): Returns whether the reactive reads inside `fn` depend on an in-flight value change that has not been revealed.
- [latest](core/latest.md): Reads the freshest in-flight value available inside `fn`, falling back to the current settled value.
- [untrack](core/untrack.md): Runs `fn` outside of any reactive tracking — reads inside `fn` will not subscribe the current scope. Returns whatever `fn` returns.

### Stores

- [createOptimisticStore](core/create-optimistic-store.md): The store equivalent of `createOptimistic`.
- [createProjection](core/create-projection.md): Creates a derived (projected) store — `createMemo` for stores. The derive function receives a mutable draft and either mutates it in place (canonical) or returns a new value.
- [createStore](core/create-store.md): Creates a deeply-reactive store backed by a Proxy. Reads track each property accessed; only the parts that change trigger updates.
- [merge](core/merge.md): Merges multiple props-like objects into a single proxy that preserves reactivity.
- [omit](core/omit.md): Returns a reactive proxy of `props` with the listed keys hidden. Tracking on the remaining keys is preserved.
- [reconcile](core/reconcile.md): Creates a store setter callback that merges new data into the existing store by key.

### Lifecycle actions

- [action](core/action.md): The primitive for mutations: imperative async workflows whose writes span an async gap — optimistic write, server round-trip, reconciling write — where intermediate state must not leak and failure must revert cleanly (pair with `createOptimistic` / `createOptimisticStore`).
- [affects](core/affects.md): Marks a reactive source or store location as pending while work that will change it is in flight.
- [onSettled](core/on-settled.md): Schedules `callback` to run once after the reactive graph has fully settled — i.e. once every pending async read inside the current owner has resolved and the queue has flushed.
- [refresh](core/refresh.md): Invalidates one reactive source, forcing it to re-execute even if its inputs haven't changed, and returns a promise for the target's next settled state — the re-ask (and anything that supersedes it) has settled.
- [until](core/until.md): Awaits a reactive predicate and resolves the first time it becomes truthy, with the narrowed value.

### Components context

- [children](core/children.md): Resolves a `children` accessor and exposes the result as an accessor with a `.toArray()` helper.
- [createContext](core/create-context.md): Creates a Context for sharing state with descendants of a Provider in the component tree.
- [createUniqueId](core/create-unique-id.md): Returns a stable id string that matches between server-rendered and client-hydrated trees. Use it for `<label for>`, `aria-labelledby`, and other attributes that need consistent ids across SSR.
- [lazy](core/lazy.md): Defines a code-split component. The returned component triggers its dynamic import on first render and suspends through any enclosing `<Loading>` boundary while the chunk is in flight.
- [useContext](core/use-context.md): Reads the current value of a context.

### Components jsx

- [Errored](core/errored.md): Catches uncaught errors inside its subtree and renders fallback content instead.
- [For](core/for.md): Creates a list of elements from a list.
- [Loading](core/loading.md): Renders a `fallback` while pending async reads inside the subtree settle.
- [Repeat](core/repeat.md): Creates a list of elements from a count.
- [Reveal](core/reveal.md): Coordinates the reveal timing of sibling `<Loading>` boundaries.
- [Show](core/show.md): Conditionally renders its children when `when` is truthy, otherwise renders the optional `fallback`.
- [Switch / Match](core/switch-and-match.md): Switches between content based on mutually exclusive conditions. Renders the first `<Match>` whose `when` is truthy; falls back to `fallback` when none match.

### Owner introspection

- [createRoot](core/create-root.md): Creates a reactive root — an owner scope with its own `dispose()`.
- [getObserver](core/get-observer.md): Returns the currently-tracking observer (the computation that subscribes to reactive reads at this point), or `null` if reads here would be untracked.
- [getOwner](core/get-owner.md): Returns the current reactive owner — the lifecycle node that the next `cleanup()` / `onCleanup()` / `createSignal()` etc. Will be attached to.
- [isDisposed](core/is-disposed.md): Returns `true` when an owner has been disposed. Use it to ignore late work after the owner’s component or reactive scope has been removed.
- [runWithOwner](core/run-with-owner.md): Executes `fn` with the given `owner` set as the current owner.

### Specialized reactivity

- [createReaction](core/create-reaction.md): Creates a reactive computation that runs after the render phase with flexible tracking.
- [createRenderEffect](core/create-render-effect.md): Creates a reactive computation that runs during the render phase as DOM elements are created and updated but not necessarily connected.
- [createTrackedEffect](core/create-tracked-effect.md): Creates a tracked reactive effect where dependency tracking and side effects happen in the same scope.
- [onCleanup](core/on-cleanup.md): Low-level reactive-cleanup primitive. Registers a callback that runs when the surrounding owner is disposed.

### Store advanced

- [deep](core/deep.md): Subscribes the surrounding scope to every reachable level of a store value, then returns its plain view.
- [isWrappable](core/is-wrappable.md): Returns whether a value would be wrapped in a store proxy.
- [snapshot](core/snapshot.md): Returns the plain, unwrapped view of a store value without tracking, for serialization or for passing to code that must not observe the store.
- [storePath](core/store-path.md): x setter paths. Prefer draft-mutating store setters in new code.

### Jsx component primitives

- [createErrorBoundary](core/create-error-boundary.md): Lower-level primitive that backs the `<Errored>` flow control. Catches thrown errors inside `fn` and invokes `fallback(error, reset)` instead.
- [createLoadingBoundary](core/create-loading-boundary.md): Lower-level primitive that backs the `<Loading>` flow control. Catches pending async reads inside `fn` and renders `fallback` until they settle.
- [createRevealOrder](core/create-reveal-order.md): Coordinate the reveal timing of sibling loading boundaries.
- [mapArray](core/map-array.md): Reactively maps an array, reusing the previously-mapped value for unchanged items.
- [repeat](core/repeat-primitive.md): Reactively renders a callback `count` times, reusing previously-rendered entries when only the count changes. Underlying helper for `<Repeat>`.

### Manual hydration

- [Hydration](core/hydration.md): Re-enables hydration within a `<NoHydration>` zone (passthrough on the client). Use it to opt a subtree back into hydration when the surrounding region was opted out.
- [NoHydration](core/no-hydration.md): Disables hydration for its children on the client. During hydration, skips the subtree entirely (returns undefined so DOM is left untouched).

### Interop async

- [enableExternalSource](core/enable-external-source.md): Registers an adapter that lets Solid track reads from a non-Solid reactive system, such as MobX or Vue reactivity, inside its computations.
- [flatten](core/flatten.md): Resolves a children value to its renderable form: unwraps zero-arg functions (accessors), recursively flattens arrays, and optionally skips non-rendering values (`null`, `undefined`, `true`, `false`, `""`).
- [NotReadyError](core/not-ready-error.md): Represents a read from an async reactive source before its first value is ready. Application code should normally let `Loading` and `Errored` boundaries handle this control flow.
- [resolve](core/resolve.md): Awaits a reactive expression and returns its first fully-settled value as a `Promise`.

### Diagnostics dev hooks

- [attribution / costs / feedback / formatOrigin / formatRerun / graphSize / subscriptions / why](core/attribution.md): The attribution engine from `solid-js/attribution`: take a hold with `enable()`, read its interaction, navigation, hold, and re-run records on `OBSERVE.records.subscribe(type, …)` or from `history(type)`, and fold them with `costs()`, `feedback()`, `why()`, and `subscriptions()`.
- [configureClientErrors](core/configure-client-errors.md): Registers the ambient client error hook: called once per error object when an error boundary renders its fallback, with where the error was thrown and where it was met.
- [DEV](core/dev.md): Dev tier (devtools hooks, graph traversal, console reporting): dev builds only.
- [OBSERVE](core/observe.md): The observe tier's wiring: the records channel the runtimes and the attribution engine deliver on, the diagnostics channel, the attribution slot, `ownerPath()`, and on the server the trace-provider slot.

### Types

- [Component / ComponentProps / FlowComponent / FlowProps / ParentComponent / ParentProps / Ref / ValidComponent / VoidComponent / VoidProps](core/component-types.md): A general `Component` has no implicit `children` prop. If desired, specify one explicitly, e.g. `Component<{ name: string; children: Element }>`.
- [Context / ContextProviderComponent](core/context-types.md): Context API reference.
- [JSX](core/jsx-types.md): Selected public types from the `JSX` namespace. Element-specific attributes are available through `JSX.IntrinsicElements`.
- [Owner](core/owner.md): Represents the owner of a reactive scope. Treat its structure as opaque and use the public owner APIs to inspect or run code in that scope.
- [Accessor / Setter / Signal / SourceAccessor](core/reactive-types.md): A zero-arg getter for a reactive value. Calling it inside a tracking scope (memo, effect compute, JSX expression) subscribes the scope to changes.
- [Store / SolidStore](core/store-types.md): A reactive view of a store's value. Update it through the paired `StoreSetter`.

## Web API

- [@solidjs/web](web/overview.md): Reference for @solidjs/web: DOM and HTML rendering, hydration, the head registry, DOM components, JSX properties, server functions, the request event, and the Performance panel tracks.

### Rendering ssr

- [clientOnly](web/client-only.md): Creates a component that renders only in the browser. The server renders the fallback, and the client keeps that fallback through hydration before mounting the imported component.
- [httpHeader](web/http-header.md): Declares an HTTP response header (or with `append`, appends to one) for the lifetime of the current reactive scope during SSR — call it bare in a component or reactive-scope body.
- [httpStatus](web/http-status.md): Declares the HTTP response status (and optional status text) for the lifetime of the current reactive scope during SSR — call it bare in a component or reactive-scope body where the status is decided (a 404 route, an error fallback).
- [hydrate](web/hydrate.md): Attaches a Solid component tree to server-rendered DOM and returns a function that disposes the hydrated tree.
- [isDev](web/is-dev.md): Build-time constant that is `true` in development output and `false` in production output.
- [isServer](web/is-server.md): Build-time constant that is `true` in server output and `false` in browser output.
- [renderToStream](web/render-to-stream.md): Streams an HTML response, flushing the synchronous shell first and then progressively emitting async-resolved fragments as their `<Loading>` boundaries settle.
- [renderToString](web/render-to-string.md): Renders a component tree synchronously to an HTML string. Async reads inside `<Loading>` boundaries emit their `fallback` content; for full-graph resolution await `renderToStream` instead.
- [render](web/render.md): Renders a component tree into a DOM element. Returns a dispose function that tears the tree down and cleans up reactive scopes when called.

### Head

- [useHead](web/use-head.md): Registers one or more head tag descriptors with Solid's ambient head registry.
- [HeadTag](web/head-tag.md): Describes a tag registered with Solid's ambient head registry.

### Components

- [dynamic](web/dynamic.md): Creates a stable component whose rendered component comes from a reactive source. The source can return a component, an intrinsic element name, a promise, or no component.
- [Portal](web/portal.md): Renders its children into a different part of the DOM (modal roots, tooltips, layers that need to escape an `overflow: hidden` ancestor).

### Jsx properties

- [ref](web/ref.md): Receives a DOM element or composes several callbacks that apply behavior to it.
- [class](web/class.md): Sets static and conditional class names from strings, objects, or nested arrays.
- [style](web/style.md): Sets an element's inline styles from a CSS string or an object of declarations.
- [textContent](web/text-content.md): Writes plain text as an element's complete contents through an optimized text-only path.
- [innerHTML](web/inner-html.md): Parses an HTML string as an element's complete contents.

### Server functions

- [Server functions](web/server-functions.md): Reference for Solid's server-function declarations, transport, and host integration.
- [parseServerFunctionActionUrl / serverFunctionActionUrl / serverFunctionUrl](web/addressing.md): Reads the function id back out of a server-rendered action url.
- [configureServerFunctionsClient](web/configure-client.md): Configures the browser server-function endpoint, codec, request preparation, and response integration.
- [GET](web/get.md): Declares that a server-function read can use HTTP GET. Calls use a cacheable URL when the encoded arguments fit and fall back to a read-only POST when they do not.
- [configureServerFunctionsServer / handleServerFunctionRequest](web/host-configuration.md): Configures request scoping, invocation policy, result transforms, no-JavaScript handling, origin checks, and codecs for server functions.
- [getServerFunctionInvocation](web/invocation-context.md): Returns the identity of the server function that is currently executing.
- [invoke](web/invoke.md): Calls a server function with invocation-scoped `signal`, `keepalive`, or `priority` options.
- [live](web/live.md): Declares a server function whose async iterable represents one value that changes over time.
- [withMeta / getServerFunctionMetadata / isServerFunction](web/metadata.md): Attaches declaration metadata to a server-function reference and returns the reference.
- [createNoJSHandler](web/progressive-enhancement.md): Creates the default response handler for browser form submissions made without the client runtime.
- [enableRichArguments](web/rich-arguments.md): Enables codec encoding for server-function arguments that JSON cannot preserve.
- [decodeResponse / registerFlightDataSource / subscribeFlightData](web/single-flight.md): Decodes a server-function response, including response envelopes and single-flight payloads.

### Request response

- [Request and response](web/request-response.md): Reference for request context, response metadata, cookies, redirects, and errors.
- [configureServerErrors](web/configure-server-errors.md): Registers the ambient server error hook: called once per error object for every failure the server runtime handles or fails on, with the site that met it; the return value, when given, replaces what the client receives.
- [parseCookieHeader / serializeCookie](web/cookies.md): Parses a `Cookie` request header into a name → value map.
- [getRequestEvent](web/get-request-event.md): Returns the request event for the current server render, middleware chain, or server-function call.
- [getTraceContext](web/get-trace-context.md): The trace the current request belongs to — continued from the incoming W3C `traceparent` when there was one, originated by the runtime otherwise; in observe/dev builds, merged with the installed provider's answer (`OBSERVE.server.trace`).
- [provideRequestEvent](web/provide-request-event.md): Runs a callback in a server request-event scope backed by `AsyncLocalStorage`.
- [redirect / isHref](web/redirect.md): Creates a redirect `Response` (status 302 by default). Pass `revalidate` to name the cache keys the mutation invalidated so the client refetches them after following the redirect.
- [reload](web/reload.md): Creates an empty `Response` that asks the client to revalidate the named cache keys without navigating.
- [respond / isResponseEnvelope](web/respond.md): A value paired with response metadata (status, headers, `revalidate`) — for the things a naked return can't express.
- [markSafeError / isSafeError](web/safe-errors.md): Marks `error` as safe to serialize to the client verbatim, opting it out of production error sanitization (see `handleServerFunctionRequest`).

### Performance tracks

- [enablePerformanceTracks](web/enable-performance-tracks.md): Paint the attribution engine's records — and the web runtime's server-function `call` and `frame` records, with the server's own timing for each response under them (its `Server-Timing` metrics, placed by the browser's resource timing; the document's at enable) — as tracks in the Chrome Performance panel, from now until the returned function is called.

## Router API

- [@solidjs/router](router/overview.md): API reference for Solid Router 2, including router creation, navigation, data, history, file routes, and server integration.
- [Router factory](router/router-factory.md): Reference for createRouter, defineRoute, defineRoutes, router configuration, and router instances.
- [Routes and typed paths](router/routes-and-paths.md): Reference for route definitions, path patterns, typed path nodes, match filters, and router matching.
- [Navigation primitives](router/navigation.md): Reference for Solid Router location, navigation, matching, search, preloading, link state, and leave guards.
- [Data APIs](router/data.md): Reference for Solid Router query caching, revalidation, actions, action invocation, and settled submissions.
- [History adapters](router/history.md): Reference for Solid Router browser, hash, and memory history adapters.
- [File-system adapter](router/filesystem.md): Reference for converting a file-routes manifest and typing Solid Router route-module configuration.
- [Server integration](router/server.md): Reference for the Solid Router server-function flight-data collector.
- [Types](router/types.md): Inventory of application-facing types exported by Solid Router 2.

## Metadata API

- [@solidjs/meta](meta/overview.md): Reference for @solidjs/meta: components that set the document title, meta tags, links, scripts, and styles from anywhere in the tree.
- [Base](meta/base.md): Base sets the document base URL through Solid Meta during server rendering.
- [Head](meta/head.md): Head groups its child head tags into one replacement set through Solid Meta.
- [Link](meta/link.md): Link adds a link element to the document head through Solid Meta.
- [Meta](meta/meta.md): Meta adds a meta element to the document head through Solid Meta.
- [Script](meta/script.md): Script adds a script element to the document head through Solid Meta.
- [Style](meta/style.md): Style adds an inline style element to the document head through Solid Meta.
- [Stylesheet](meta/stylesheet.md): Stylesheet adds a stylesheet link element to the document head through Solid Meta.
- [Title](meta/title.md): Title sets the document title through Solid Meta.

## Vite API

- [@solidjs/vite-plugin](vite/overview.md): Public exports and generated modules provided by @solidjs/vite-plugin 3.0 for Solid 2.0.
- [solidPlugin](vite/options.md): Configures Solid JSX compilation and the optional serving and server-function modes.
- [StartOptions](vite/start.md): Configures @solidjs/vite-plugin client or SSR start mode.
- [serverFunctions](vite/server-functions.md): Compiles use-server directives and emits server-function manifest and handler modules.
- [Modules and manifest](vite/modules.md): Reference for @solidjs/vite-plugin manifest types, virtual modules, and boundary marker modules.

## Filesystem routing API

- [filesystem-routing](filesystem/overview.md): Public exports for filesystem-routing scanning, conventions, Vite delivery, and API dispatch.
- [filesystem-routing core](filesystem/core.md): Reference for the bundler-neutral scanner, manifest types, and module analysis exports.
- [Route conventions](filesystem/conventions.md): Reference for nested and flat route filename conventions.
- [filesystem-routing/tree](filesystem/tree.md): Builds nested route trees and removes route-group segments.
- [filesystem-routing/vite](filesystem/vite.md): Configures Vite delivery of a file-system route manifest.
- [filesystem-routing/api](filesystem/api.md): Matches manifest HTTP handlers and dispatches them as fetch-style middleware.
- [Manifest module](filesystem/manifest.md): Reference for virtual:file-routes runtime output and TypeScript declarations.
