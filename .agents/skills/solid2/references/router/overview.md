# @solidjs/router

Solid Router is published through three package entries.

## Entries

* `@solidjs/router` exports the router factory, route helpers, navigation primitives, history adapters, queries, actions, and public types.
* `@solidjs/router/fs` exports the file-system manifest adapter.
* `@solidjs/router/server` exports the server-function flight-data collector.

## Reference groups

* [Router factory](router-factory.md): `createRouter`, `defineRoute`, and `defineRoutes`
* [Routes and typed paths](routes-and-paths.md): route definitions, path patterns, `int`, instance paths, and matching
* [Navigation primitives](navigation.md): location, navigation, matching, search, preloading, link state, and leave guards
* [Data APIs](data.md): `query`, `revalidate`, `action`, `useAction`, and `useSubmissions`
* [History adapters](history.md): browser, hash, and memory histories
* [File-system adapter](filesystem.md): `fileRoutes` and `defineFileRoute`
* [Server integration](server.md): `createFlightDataCollector`
* [Types](types.md): public application-facing types
