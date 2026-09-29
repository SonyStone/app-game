# @solid-primitives/url

Source version: `0.2.0-next.3`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/url/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


Reactive primitives for the Browser's `Location`, `URL`, and `URLSearchParams` interfaces.

> **Already using [Solid Router](https://docs.solidjs.com/solid-router)?** It already covers a lot of the same ground — reactive location, search params, and navigation — and is the better choice if you need routing anyway. These primitives are for when you want that reactivity without pulling in a router, e.g. in a non-routed app or a library.

- [`createLocationState`](url.md#createlocationstate) — Reactive `window.location` state, with `push`/`replace`/`navigate` setters.
- [`useSharedLocationState`](url.md#usesharedlocationstate) — Shared-root version of `createLocationState`.
- [`updateLocation`](url.md#updatelocation) — Non-reactive helper to push, replace, or navigate to a new href.
- [`createURL`](url.md#createurl) / [`ReactiveURL`](url.md#reactiveurl) — A reactive `URL`-like object.
- [`createURLRecord`](url.md#createurlrecord) — A `URL` instance as a reactive store.
- [`createSearchParams`](url.md#createsearchparams) / [`ReactiveSearchParams`](url.md#reactivesearchparams) — A reactive `URLSearchParams`-like object.
- [`createLocationSearchParams`](url.md#createlocationsearchparams) — Reactive record of `window.location.search`.

## Installation

```bash
npm install @solid-primitives/url
# or
pnpm add @solid-primitives/url
# or
yarn add @solid-primitives/url
```

## `createLocationState`

Creates a reactive `window.location` state. The state updates whenever the location changes —
via back/forward navigation, a `#hash` change, or `history.pushState`/`replaceState` — and can be
modified using the provided setter methods.

```ts
import { createLocationState } from "@solid-primitives/url";

const [state, { push }] = createLocationState();
state.href; // => "http://example.com/"
push({ hash: "heading1" });
state.href; // => "http://example.com/#heading1"
```

### Setter methods

`createLocationState` provides three setter methods for updating the `window.location` state.
All have the same interface, but cause different side effects:

- `push` — uses `history.pushState`
- `replace` — uses `history.replaceState`
- `navigate` — overwrites `location.href`, forcing a full navigation

Each setter accepts either a partial record (or an updater function returning one), or a single
`(key, value)` pair:

```ts
push({ pathname: "/other", hash: "top" });
push(prev => ({ search: prev.search + "&page=2" }));
push("hash", "top");
```

### Server fallback

`location` isn't available on the server, so a fallback has to be provided — either per-call, or
globally with `setLocationFallback` (call it before the primitives that rely on it):

```ts
// fallback can be a href string, a URL instance, or a LocationState object
const [state] = createLocationState("http://example.com");

// or globally, once, before rendering:
setLocationFallback("http://example.com");
const [state] = createLocationState();
```

## `useSharedLocationState`

Reuses a [singleton root](rootless.md#createsingletonroot)
`createLocationState`, or creates one if one isn't active yet. Use it instead of
`createLocationState` to avoid recreating signals, computations, and event listeners for every
consumer. Its interface is the same, minus the `fallback` argument — use `setLocationFallback`
instead.

```ts
const [state, { push }] = useSharedLocationState();
```

## `updateLocation`

A non-reactive utility to push, replace, or navigate to a new href.

```ts
updateLocation("http://example.com?foo=bar", "push");
```

## `createURL`

Creates an instance of [`ReactiveURL`](url.md#reactiveurl).

```ts
import { createURL } from "@solid-primitives/url";

const url = createURL("http://example.com");
url.host; // => "example.com"
url.search = "?foo=bar";
createEffect(() => console.log(url.href));
```

## `ReactiveURL`

An object providing reactive setters and getters for managing a URL — same interface as the
native `URL` class, but every getter is granularly reactive, causing updates only when its value
has actually changed.

`ReactiveURL` does **not** extend `URL`, so `x instanceof URL` won't hold. As a reactive
structure, it should be instantiated under a reactive root (e.g. inside `createRoot` or a
component).

```ts
const url = new ReactiveURL("http://example.com");
url.host; // => "example.com"
url.search = "?foo=bar";
url.hash = "heading1";
createEffect(() => console.log(url.href));
```

### `searchParams`

Same as the native `URL` class, `ReactiveURL` provides a `searchParams` getter, returning an
instance of [`ReactiveSearchParams`](url.md#reactivesearchparams) kept in sync with `url.search` in
both directions. The reference is stable, so it can be destructured freely.

```ts
const url = new ReactiveURL("http://example.com");
const { searchParams } = url;

createEffect(() => console.log(searchParams.get("foo")));
url.search = "?foo=bar"; // reruns the effect above
searchParams.set("foo", "baz"); // updates url.search to "?foo=baz"
```

## `createURLRecord`

Provides a `URL` instance as a reactive store.

```ts
import { createURLRecord } from "@solid-primitives/url";

const [url, setURL] = createURLRecord("http://example.com");
url.host; // => "example.com"
setURL({ hash: "heading1" });
url.hash; // => "#heading1"
```

## `createSearchParams`

Creates an instance of [`ReactiveSearchParams`](url.md#reactivesearchparams).

```ts
const params = createSearchParams("foo=1&foo=2&bar=baz");
```

## `ReactiveSearchParams`

A reactive version of the `URLSearchParams` class. Every read method is granular — it causes an
update only when the value it read has actually changed.

`ReactiveSearchParams` extends `URLSearchParams`, so `x instanceof URLSearchParams` holds. As a
reactive structure, it should be instantiated under a reactive root.

```ts
const params = new ReactiveSearchParams("foo=1&foo=2&bar=baz");
createEffect(() => console.log(params.getAll("foo")));
params.append("foo", "3");
```

## `createLocationSearchParams`

Provides a reactive record reflecting `window.location.search`, updating whenever the browser's
search params change, along with setter methods to update them.

```ts
import { createLocationSearchParams } from "@solid-primitives/url";

const [params, { push }] = createLocationSearchParams();
params.foo; // T: string | string[] | undefined
push({ ...params, page: "2" });
```

Passing `(name, value)` updates a single param, keeping the rest of the query string intact:

```ts
push("page", "3");
```

Options:

- `useSharedState` — use the shared-root version of the reactive location state (see
  [`useSharedLocationState`](url.md#usesharedlocationstate)).

## `useSharedLocationSearchParams`

Reuses a shared-root `createLocationSearchParams`, or creates one if one isn't active.

```ts
const [params, { push }] = useSharedLocationSearchParams();
```

## `getSearchParamsRecord`

A non-reactive helper turning a `URLSearchParams` instance (or a search string) into a plain
record — a single value for names that appear once, an array of values for names that repeat.

```ts
import { getSearchParamsRecord } from "@solid-primitives/url";

const record = getSearchParamsRecord("?foo=bar");
record; // => { foo: "bar" }
```

## Changelog

<details>
<summary><b>Expand Changelog</b></summary>

0.1.0

Rewritten for Solid 2.0. Adapted from the original design proposed in
[PR #77](https://github.com/solidjs-community/solid-primitives/pull/77).

</details>
