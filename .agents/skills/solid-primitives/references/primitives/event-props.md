# @solid-primitives/event-props

Source version: `1.0.0-next.3`.

[Upstream source](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/event-props/README.md) · [Skill catalogue](../catalogue.md#primitives-catalogue)



A helpful primitive that creates the event props and a reactive store with the latest events

## Installation

```bash
npm install @solid-primitives/event-props
# or
yarn add @solid-primitives/event-props
# or
pnpm add @solid-primitives/event-props
```

## How to use it

### createEventProps

Receive the event props and a props with the latest events:

```ts
const [events, eventProps] = createEventProps('mousedown', 'mousemove', 'mouseup');

const isMouseDown = createMemo(() => (events.mousedown?.ts ?? 0) > (events.mouseup?.ts ?? 1));

createEffect(
  () => isMouseDown() && events.mousemove,
  mousemove => {
    if (mousemove) {
      console.log(mousemove.clientX, mousemove.clientY);
    }
  },
);

<div {...eventProps}>Click and drag on me</div>
```

## Changelog

See [CHANGELOG.md](https://github.com/solidjs-community/solid-primitives/blob/134c5cac19cc5f53dd5a394ecb42252184e8706b/packages/event-props/CHANGELOG.md)
