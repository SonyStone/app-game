<Header>

# Effects <Badge>Core</Badge>

<Description>
  Solid 2 effects separate dependency computation from side-effect application. onSettled and onCleanup cover
  component lifecycle work.
</Description>

</Header>

<Section>

## createEffect

Pass a pure source computation first and the side effect second. The source tracks dependencies; the callback receives
the latest and previous values.

```tsx
import { createEffect, createSignal } from 'solid-js';

const [count, setCount] = createSignal(0);

createEffect(count, (value, previous) => {
  console.log('count changed:', value, 'was:', previous);
  document.title = `Count: ${value}`;
});
```

</Section>

<Section>

## Cleanup

Return a cleanup from the effect callback. It runs before the next callback and when the owner disposes.

```tsx
import { createEffect } from 'solid-js';

createEffect(
  () => intervalMs(),
  (delay) => {
    const id = setInterval(() => console.log('tick'), delay);
    return () => clearInterval(id);
  }
);
```

</Section>

<Section>

## onSettled and onCleanup in components

`onSettled` runs after the component's initial render has settled. Return teardown work directly or register it with
`onCleanup`.

```tsx
import { onSettled } from 'solid-js';

function ResizeWatcher() {
  onSettled(() => {
    const handler = () => console.log(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  });

  return null;
}
```

</Section>

<Section>

## Dynamic dependency sets

Use `createTrackedEffect` when dependencies must be discovered inside the side-effect body. Prefer `createEffect` when
you can describe the source separately.

```tsx
import { createTrackedEffect } from 'solid-js';

createTrackedEffect(() => {
  console.log(enabled() ? primary() : fallback());
});
```

</Section>

<Section>

## Reading without tracking

`untrack` reads reactive state without adding it to the current computation's dependency set.

```tsx
import { createEffect, untrack } from 'solid-js';

createEffect(a, (aValue) => {
  const bValue = untrack(b);
  console.log(aValue + bValue);
});
```

</Section>
