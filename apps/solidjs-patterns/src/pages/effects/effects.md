<Header>

# Effects <Badge>Core</Badge>

<Description>
  Effects run side-effects in response to reactive changes. SolidJS provides createEffect, onMount, and onCleanup
  as the primary tools.
</Description>

</Header>

<Section>

## createEffect

Runs immediately and re-runs whenever its reactive dependencies change. It is not for producing values, use
`createMemo` for that.

```tsx
import { createSignal, createEffect } from 'solid-js';

const [count, setCount] = createSignal(0);

createEffect(() => {
  // Runs immediately, then on every count() change
  console.log('count changed:', count());
  document.title = `Count: ${count()}`;
});
```

</Section>

<Section>

## onCleanup

Registers a cleanup function that runs before the effect re-runs and when the owner disposes.

```tsx
import { createEffect, onCleanup } from 'solid-js';

createEffect(() => {
  const id = setInterval(() => console.log('tick'), 1000);

  // Runs before next effect execution or on dispose
  onCleanup(() => clearInterval(id));
});
```

</Section>

<Section>

## onMount / onCleanup in components

onMount runs once after the component mounts. Use onCleanup for teardown.

```tsx
import { onMount, onCleanup } from 'solid-js';

function ResizeWatcher() {
  onMount(() => {
    const handler = () => console.log(window.innerWidth);
    window.addEventListener('resize', handler);
    onCleanup(() => window.removeEventListener('resize', handler));
  });
  return null;
}

// Better: use @solid-primitives/event-listener
import { makeEventListener } from '@solid-primitives/event-listener';

function ResizeWatcher() {
  onMount(() => {
    makeEventListener(window, 'resize', () => console.log(window.innerWidth));
    // Cleaned up automatically on unmount
  });
  return null;
}
```

</Section>

<Callout type="warning" title="Effects run after render">
  `createEffect` is scheduled after the DOM has updated. For synchronous tracking during rendering, use `
    createRenderEffect
  `.
</Callout>

<Section>

## on() - explicit dependencies

on() lets you specify dependencies explicitly, avoiding implicit tracking. This is useful for watching specific
signals.

```tsx
import { createSignal, createEffect, on } from 'solid-js';

const [source, setSource] = createSignal(0);
const [other, setOther] = createSignal('hello');

// Only re-runs when source changes - other is not tracked
createEffect(
  on(source, (value, prevValue) => {
    console.log('source:', value, 'was:', prevValue);
    // Safe to read other() here without subscribing
    console.log('other snapshot:', other());
  })
);

// Defer first run (don't run on init)
createEffect(
  on(
    source,
    () => {
      console.log('source changed (not initial)');
    },
    { defer: true }
  )
);
```

</Section>

<Section>

## Tracking context

Only code inside a reactive root tracks dependencies. Reading signals outside tracking context, for example in async
callbacks, will not subscribe.

```tsx
import { createSignal, createEffect, untrack } from 'solid-js';

const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

createEffect(() => {
  // Tracks a - effect re-runs when a changes
  const aVal = a();

  // Does NOT track b - untrack reads without subscribing
  const bVal = untrack(() => b());

  console.log(aVal + bVal);
});
```

</Section>

<Section>

## Live Demo

<EffectsDemo />

</Section>
