# @solid-primitives/cursor

Source version: `1.0.0-next.3`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/cursor/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


Utilities for setting the CSS cursor property via reactive primitives (`createBodyCursor`, `createElementCursor`) and imperative APIs (`makeBodyCursor`, `makeElementCursor`).

- [`makeBodyCursor`](cursor.md#makebodycursor) - Set cursor on body immediately; returns a cleanup function.
- [`makeElementCursor`](cursor.md#makeelementcursor) - Set cursor on an element immediately; returns a cleanup function.
- [`createBodyCursor`](cursor.md#createbodycursor) - Set cursor on body reactively.
- [`createElementCursor`](cursor.md#createelementcursor) - Set cursor on a specific element reactively.
- [`createDragCursor`](cursor.md#createdragcursor) - Show `grab`/`grabbing` cursors during pointer drag.
- [`cursorRef`](cursor.md#cursorref) - Ref factory for inline JSX use.

## Installation

```bash
npm install @solid-primitives/cursor
# or
yarn add @solid-primitives/cursor
# or
pnpm add @solid-primitives/cursor
```

## `makeBodyCursor`

Sets a cursor on the body element immediately and returns a cleanup function that restores the previous value. No reactive owner required.

```ts
import { makeBodyCursor } from "@solid-primitives/cursor";

// Show a loading cursor during an async operation
const restore = makeBodyCursor("wait");
await doSomething();
restore();
```

## `makeElementCursor`

Sets a cursor on a specific element immediately and returns a cleanup function that restores the previous value. No reactive owner required.

```ts
import { makeElementCursor } from "@solid-primitives/cursor";

const el = document.querySelector("#element")!;
const restore = makeElementCursor(el, "not-allowed");
// ... later
restore();
```

## `createBodyCursor`

Sets a cursor on the body element reactively. The cursor is removed when the owner is disposed or when the signal returns a falsy value.

```ts
import { createBodyCursor } from "@solid-primitives/cursor";

const [cursor, setCursor] = createSignal("pointer");
const [enabled, setEnabled] = createSignal(true);

createBodyCursor(() => enabled() && cursor());

setCursor("help");
```

## `createElementCursor`

Sets a cursor on a specific element reactively. Accepts an element or a signal returning one — returning a falsy value unsets the cursor.

```ts
import { createElementCursor } from "@solid-primitives/cursor";

const target = document.querySelector("#element");
const [cursor, setCursor] = createSignal("pointer");
const [enabled, setEnabled] = createSignal(true);

createElementCursor(() => enabled() && target, cursor);

setCursor("help");
```

## `createDragCursor`

Shows `"grab"` on a target element and switches to `"grabbing"` on the body during a pointer drag. Setting `"grabbing"` on the body ensures the cursor renders correctly everywhere during drag, not just over the target element.

```ts
import { createDragCursor } from "@solid-primitives/cursor";

const [ref, setRef] = createSignal<HTMLElement>();

createDragCursor(ref);

<div ref={setRef}>Drag me</div>
```

Custom cursor values can be provided via options:

```ts
createDragCursor(el, { grab: "crosshair", grabbing: "move" });
```

## `cursorRef`

A ref factory for setting a cursor inline in JSX. Accepts a static cursor value or a reactive signal. The cursor is removed when the component unmounts.

```tsx
import { cursorRef } from "@solid-primitives/cursor";

// Static
<div ref={cursorRef("pointer")}>...</div>;

// Reactive
const [cursor, setCursor] = createSignal<CursorProperty>("pointer");
<div ref={cursorRef(cursor)}>...</div>;
```

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/cursor/CHANGELOG.md)
