# @solid-primitives/mouse

Source version: `4.0.0-next.4`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/mouse/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)


A collection of primitives, capturing current mouse cursor position, and helping to deal with common usecases:

##### Reactive primitives:

- [`createMousePosition`](mouse.md#createmouseposition) - Listens to the mouse events, providing a reactive up-to-date position of the cursor on the page.
- [`createPositionToElement`](mouse.md#createpositiontoelement) - Provides an auto-updating position relative to a provided element.

##### Non-reactive primitives:

- [`makeMousePositionListener`](mouse.md#makemousepositionlistener) - Attaches event listeners to provided target, listening for changes to the mouse/touch position.
- [`makeMouseInsideListener`](mouse.md#makemouseinsidelistener) - Attaches event listeners to provided target, listening for mouse/touch entering/leaving the element.

##### Calculations:

- [`getPositionToElement`](mouse.md#getpositiontoelement) - Turn position relative to the page, into position relative to an element.
- [`getPositionInElement`](mouse.md#getpositioninelement) - Turn position relative to the page, into position relative to an element. Clamped to the element bounds.
- [`getPositionToScreen`](mouse.md#getpositiontoscreen) - Turn position relative to the page, into position relative to the screen.

## Installation

```bash
npm install @solid-primitives/mouse
# or
pnpm add @solid-primitives/mouse
# or
yarn add @solid-primitives/mouse
```

## `createMousePosition`

Attaches event listeners to provided target, providing a reactive up-to-date position of the cursor on the page.

#### Usage

```tsx
import { createMousePosition } from "@solid-primitives/mouse";

const pos = createMousePosition(window);
createEffect(() => {
  console.log(pos.x, pos.y);
});

// target can be a reactive signal
const [el, setEl] = createSignal(ref);
const pos = createMousePosition(el);

// if using a jsx ref, pass it as a function, or wrap primitive inside onMount
let ref;
const pos = createMousePosition(() => ref);
<div ref={ref}></div>;
```

By default `createMousePosition` is listening to `touch` events as well. You can disable that behavior with `touch` and `followTouch` options.

```ts
// disables following touch position – only registers touch start
const pos = createMousePosition(window, { followTouch: false });

// disables listening to any touch events
const pos = createMousePosition(window, { touch: false });
```

#### `useMousePosition`

This primitive provides a [singleton root](rootless.md#createsingletonroot) variant that will listen to window mouse position, and reuse event listeners and signals across dependents.

```ts
const pos = useMousePosition();
createEffect(() => {
  console.log(pos.x, pos.y);
});
```

#### Definition

```ts
function createMousePosition(
  target?: MaybeAccessor<SVGSVGElement | HTMLElement | Window | Document>,
  options?: MousePositionOptions,
): MousePositionInside;
```

## `createPositionToElement`

Provides an autoupdating position relative to an element based on provided page position.

#### Usage

```ts
import { createPositionToElement, useMousePosition } from "@solid-primitives/mouse";

const pos = useMousePosition();
const relative = createPositionToElement(ref, () => pos);

createEffect(() => {
  console.log(relative.x, relative.y);
});

// target can be a reactive signal
const [el, setEl] = createSignal(ref);
const relative = createPositionToElement(el, () => pos);

// if using a jsx ref, pass it as a function, or wrap primitive inside onMount
let ref;
const relative = createPositionToElement(() => ref);
<div ref={ref}></div>;
```

#### Definition

```ts
function createPositionToElement(
  element: Element | Accessor<Element | undefined>,
  pos: Accessor<Position>,
  options?: PositionToElementOptions,
): PositionRelativeToElement;
```

## Non-reactive primitives:

### `makeMousePositionListener`

###### Added id `@2.0.0`

Attaches event listeners to provided target, listening for changes to the mouse/touch position.

```ts
const clear = makeMousePositionListener(el, pos => console.log(pos), { touch: false });
// remove listeners manually (will happen on cleanup)
clear();
```

### `makeMouseInsideListener`

###### Added id `@2.0.0`

Attaches event listeners to provided target, listening for mouse/touch entering/leaving the element.

```ts
const clear = makeMouseInsideListener(el, inside => console.log(inside), { touch: false });
// remove listeners manually (will happen on cleanup)
clear();
```

## Calculations

### `getPositionToElement`

Turn position relative to the page, into position relative to an element.

```ts
const pos = getPositionToElement(pageX, pageY, element);
```

### `getPositionInElement`

Turn position relative to the page, into position relative to an element. Clamped to the element bounds.

```ts
const pos = getPositionInElement(pageX, pageY, element);
```

### `getPositionToScreen`

Turn position relative to the page, into position relative to the screen.

```ts
const pos = getPositionToScreen(pageX, pageY);
```

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/mouse/CHANGELOG.md)
