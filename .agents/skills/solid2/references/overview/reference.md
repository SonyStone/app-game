# Reference

The reference documents every public export, one page per API.
If you are learning Solid, start with the [Learn pages](index.md) and come here for exact signatures; if you know what you need, search for the export name.

## Packages

| Package                                                | What it covers                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [`solid-js`](../core/overview.md)                      | Signals, memos, effects, stores, actions, context, and the built-in flow components             |
| [`@solidjs/web`](../web/overview.md)                 | Rendering to the DOM and to HTML, hydration, head tags, server functions, and the request event |
| [`@solidjs/router`](../router/overview.md)           | Route definitions, typed navigation, route data, and server integration                         |
| [`@solidjs/meta`](../meta/overview.md)               | Components for `<title>`, `<meta>`, `<link>`, and the other head tags                           |
| [`@solidjs/vite-plugin`](../vite/overview.md) | The JSX transform, start mode, and `"use server"` compilation                                   |
| [`filesystem-routing`](../filesystem/overview.md)  | Route scanning, file conventions, and the generated route manifest                              |

## How a page is organized

Each generated page follows the same order, so you can jump to the part you need:

* **Import** and **Type signature** come straight from the source at the recorded `source_path`.
* **Parameters** or **Props** list each argument with its type. **Return value** describes what comes back.
* **Examples** show the API in a realistic component or module.
* **Caveats** collect the rules that are not obvious from the signature.
* **Common problems** link to the troubleshooting sections of the Learn pages.
* **Learn more** links to the concept page that explains the model behind the API.
* **Related types** documents the option and return types that the page's exports use.

Pages under **Advanced** cover owner introspection, custom boundary primitives, manual hydration, and development hooks.
Application code rarely needs them; they exist for library and tooling authors.

## Most used

* [`createSignal`](../core/create-signal.md), [`createMemo`](../core/create-memo.md), and [`createEffect`](../core/create-effect.md)
* [`createStore`](../core/create-store.md) and [`reconcile`](../core/reconcile.md)
* [`Show`](../core/show.md), [`For`](../core/for.md), [`Switch` and `Match`](../core/switch-and-match.md)
* [`Loading`](../core/loading.md) and [`Errored`](../core/errored.md)
* [`action`](../core/action.md) and [`onSettled`](../core/on-settled.md)
* [`render`](../web/render.md) and [`hydrate`](../web/hydrate.md)
* [`createRouter`](../router/router-factory.md#createrouter) and [`query`](../router/data.md#query)

## Versions and sources

Reference pages are generated from the Solid source at the commit recorded in each page's frontmatter (`source_repo`, `source_ref`, `source_path`).
When a signature on this site disagrees with the type your editor shows, your installed version differs from the documented one; the frontmatter tells you which commit the page describes.
