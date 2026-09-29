# @solid-primitives/styles

Source version: `1.0.0-next.3`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/styles/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


Collection of reactive primitives focused on styles.

- [`createRemSize`](styles.md#createremsize) - Create a reactive signal of css `rem` size in pixels.

## Installation

```bash
npm install @solid-primitives/styles
# or
yarn add @solid-primitives/styles
# or
pnpm add @solid-primitives/styles
```

## `createRemSize`

Creates a reactive signal with value of the current rem size in pixels, and tracks it's changes.

### How to use it

It takes no arguments and returns a number signal.

```ts
import { createRemSize } from "@solid-primitives/styles";

const remSize = createRemSize();
console.log(remSize()); // 16

createEffect(() => {
  console.log(remSize()); // remSize value will be logged on every change to the root font size
});
```

### `useRemSize`

This primitive provides a [singleton root](rootless.md#createsingletonroot) variant that will reuse signals, HTML elements and the ResizeObserver instance across all dependents that use it.

It's behavior is the same as [`createRemSize`](styles.md#createremsize).

```ts
import { useRemSize } from "@solid-primitives/styles";

const remSize = useRemSize();
console.log(remSize()); // 16
```

### Server fallback

When using this primitive on the server, it will return a signal with a value of `16` by default. You can override this value by calling the `setServerRemSize` helper with a new value, before calling `createRemSize` or `useRemSize`.

```ts
import { setServerRemSize, createRemSize } from "@solid-primitives/styles";

setServerRemSize(10);

const remSize = createRemSize();
console.log(remSize()); // 10 instead of 16 (only on the server!)
```

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/styles/CHANGELOG.md)
