# @solid-primitives/mutation-observer

Source version: `3.0.0-next.3`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/mutation-observer/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


Primitive providing the ability to watch for changes made to the DOM tree. A wrapper for Browser's [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver) API.

## Installation

```
npm install @solid-primitives/mutation-observer
# or
yarn add @solid-primitives/mutation-observer
# or
pnpm add @solid-primitives/mutation-observer
```

## How to use it

### createMutationObserver

```ts
import { createMutationObserver } from "@solid-primitives/mutation-observer";

// Use the returned `add` as a ref — options are set at creation time:
const [add] = createMutationObserver([], { childList: true }, records => console.log(records));
<div ref={add} />

// Observe multiple elements:
const [add, { start, stop }] = createMutationObserver(
  () => [el1, el2, el3],
  { attributes: true, subtree: true },
  records => console.log(records)
);

// Per-element options:
createMutationObserver(
  [[el, { attributes: true }], [el1, { childList: true }]],
  records => console.log(records)
);
```

Automatically starts observing after the component settles (via `onSettled`) and disconnects on cleanup. You can also control observation manually with `start()` and `stop()`.

### Standalone Ref

`mutationObserver` is a convenience for observing a single element without calling `createMutationObserver` separately:

```tsx
import { mutationObserver } from "@solid-primitives/mutation-observer";

<div ref={mutationObserver({ childList: true }, records => console.log(records))} />;
```

### Types

```ts
function createMutationObserver(
  initial: MaybeAccessor<Node | Node[]>,
  options: MutationObserverInit,
  callback: MutationCallback,
): MutationObserverReturn;
function createMutationObserver(
  initial: MaybeAccessor<[Node, MutationObserverInit][]>,
  callback: MutationCallback,
): MutationObserverReturn;

type MutationObserverReturn = [
  add: MutationObserverAdd,
  rest: {
    start: Fn;
    stop: Fn;
    instance: MutationObserver;
    isSupported: boolean;
  },
];

type MutationObserverAdd = (target: Node, options?: MaybeAccessor<MutationObserverInit>) => void;

const mutationObserver: (
  options: MutationObserverInit,
  callback: MutationCallback,
) => (target: Element) => void;
```

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/mutation-observer/CHANGELOG.md)
