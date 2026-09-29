# @solid-primitives/page-utilities

Source version: `3.0.0-next.3`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/page-utilities/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


Primitives for tracking page visibility and intercepting navigation away from the page.

- [`createPageVisibility`](page-utilities.md#createpagevisibility) - Reactive signal tracking whether the page is currently visible
- [`usePageVisibility`](page-utilities.md#usepagevisibility) - Shared [singleton root](rootless.md#createsingletonroot) version of `createPageVisibility`
- [`makePageLeave`](page-utilities.md#makepageleave) - Intercepts `beforeunload` to prevent navigation; returns a manual cleanup function
- [`createPageLeaveBlocker`](page-utilities.md#createpageleaveblocker) - Reactive version of `makePageLeave`; accepts a signal to toggle prevention

## Installation

```bash
npm install @solid-primitives/page-utilities
# or
yarn add @solid-primitives/page-utilities
# or
pnpm add @solid-primitives/page-utilities
```

## `createPageVisibility`

Returns a reactive boolean signal reflecting the [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) — `true` when the page is visible, `false` when hidden or in a prerender state. On the server it always returns `true`.

```ts
import { createPageVisibility } from "@solid-primitives/page-utilities";

const visible = createPageVisibility();

createEffect(() => {
  console.log(visible()); // => boolean
});
```

### Definition

```ts
function createPageVisibility(): Accessor<boolean>;
```

## `usePageVisibility`

A [singleton root](rootless.md#createsingletonroot) version of `createPageVisibility`. The underlying event listener and signal are shared across all callers, making it more efficient when used in multiple places simultaneously.

```ts
import { usePageVisibility } from "@solid-primitives/page-utilities";

const visible = usePageVisibility();

createEffect(() => {
  console.log(visible()); // => boolean
});
```

### Definition

```ts
const usePageVisibility: () => Accessor<boolean>;
```

## `makePageLeave`

Intercepts the browser's [`beforeunload`](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event) event to show a confirmation dialog when the user attempts to close the tab, refresh, or navigate away. Returns a cleanup function to remove the listener.

```ts
import { makePageLeave } from "@solid-primitives/page-utilities";

const cleanup = makePageLeave();

// remove the listener when done
cleanup();
```

### Definition

```ts
function makePageLeave(): VoidFunction;
```

## `createPageLeaveBlocker`

Reactive version of `makePageLeave`. Accepts an optional `enabled` parameter — a static boolean or a reactive signal — to toggle prevention on and off. Defaults to `true`. Automatically removes the listener when the reactive owner is disposed. No-ops on the server.

```ts
import { createPageLeaveBlocker } from "@solid-primitives/page-utilities";

// Always block navigation
createPageLeaveBlocker();
```

A common pattern is gating on unsaved state:

```ts
const [isDirty, setIsDirty] = createSignal(false);

createPageLeaveBlocker(isDirty);
```

### Definition

```ts
function createPageLeaveBlocker(enabled?: MaybeAccessor<boolean>): void;
```

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/page-utilities/CHANGELOG.md)
