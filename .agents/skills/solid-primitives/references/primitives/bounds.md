# @solid-primitives/bounds

Source version: `1.0.0-next.3`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/bounds/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


Primitives for tracking HTML element size and position on screen as it changes.

- [`createElementBounds`](bounds.md#createelementbounds) - Creates a reactive store-like object of current element bounds — position on the screen, and size dimensions.

## Installation

```bash
npm install @solid-primitives/bounds
# or
yarn add @solid-primitives/bounds
# or
pnpm add @solid-primitives/bounds
```

## `createElementBounds`

Creates a reactive store-like object of current element bounds — position on the screen, and size dimensions. Bounds will be automatically updated on scroll, resize events and updates to the DOM.

```ts
import { createElementBounds } from "@solid-primitives/bounds";

const target = document.querySelector("#my_elem")!;
const bounds = createElementBounds(target);

createEffect(() => {
  console.log(
    bounds.width, // => number
    bounds.height, // => number
    bounds.top, // => number
    bounds.left, // => number
    bounds.right, // => number
    bounds.bottom, // => number
  );
});
```

### Reactive target

The element target can be a reactive signal. Set to falsy value to disable tracking.

```tsx
const [target, setTarget] = createSignal<HTMLElement>();

const bounds = createElementBounds(target);

// if target is undefined, scroll values will be null
createEffect(() => {
  bounds.width; // => number | null
  bounds.height; // => number | null
});

// bounds object will always be in sync with current target
<div ref={setTarget} />;
```

### Disabling types of tracking

These types of tracking are available: _(all are enabled by default)_

- `trackScroll` — listen to window scroll events
- `trackMutation` — listen to changes to the dom structure/styles
- `trackResize` — listen to element's resize events

```ts
// won't track mutations nor scroll events
const bounds = createElementBounds(target, {
  trackScroll: false,
  trackMutation: false,
});
```

### Throttling updates

Options [above](bounds.md#disabling-types-of-tracking) allow passing a guarding function for controlling frequency of updates.

The scroll event/mutations/resizing can be triggered dozens of times per second, causing calculating bounds and updating the store every time. Hence it is a good idea to [throttle/debounce](scheduled.md) updates.

```ts
import { UpdateGuard, createElementBounds } from "@solid-primitives/bounds";
import { throttle } from "@solid-primitives/scheduled";

const throttleUpdate: UpdateGuard = fn => throttle(fn, 500);

const bounds = createElementBounds(target, {
  trackMutation: throttleUpdate,
  trackScroll: throttleUpdate,
});
```

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/bounds/CHANGELOG.md)
