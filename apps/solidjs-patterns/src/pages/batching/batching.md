<Header>

# Scheduling & Untrack <Badge>Core</Badge>

<Description>
  Solid stages updates automatically until the current microtask ends. flush() applies pending work immediately,
  while untrack() reads reactive values without creating a dependency.
</Description>

</Header>

<Section>

## Automatic batching

Solid 2 stages signal and store updates automatically. Subscribers see one settled state after synchronous work
finishes, regardless of whether updates happen in an event handler, timer, or promise callback.

```ts
import { createEffect, createSignal } from 'solid-js';

const [x, setX] = createSignal(0);
const [y, setY] = createSignal(0);

createEffect(
  () => [x(), y()] as const,
  ([nextX, nextY]) => console.log(nextX, nextY)
);

setX(1);
setY(1);
// effect: 1, 1 (single run after the current microtask)
```

</Section>

<Section>

## Live Demo: automatic scheduling

<BatchDemo />

</Section>

<Section>

## untrack()

Reads reactive values without subscribing. Use inside effects or memos to access data without triggering re-runs.

```ts
import { createSignal, createEffect, untrack } from 'solid-js';

const [trigger, setTrigger] = createSignal(0);
const [data, setData] = createSignal('hello');

// Effect only re-runs when trigger changes
createEffect(trigger, () => {
  // Read data without subscribing - won't re-run when data changes
  const snapshot = untrack(data);
  console.log('triggered, data snapshot:', snapshot);
});
```

</Section>

<Callout type="warning" title="flush is an imperative escape hatch">
  Use `flush()` only when code must observe pending reactive work immediately, such as measuring DOM after a state
  change. Normal application updates should rely on automatic scheduling.
</Callout>

<Section>

## Practical: multi-field form reset

Multiple setters can be called directly. Subscribers receive the final state once synchronous work settles.

```ts
const [name, setName] = createSignal('');
const [email, setEmail] = createSignal('');
const [age, setAge] = createSignal(0);

function resetForm() {
  setName('');
  setEmail('');
  setAge(0);
  // Subscribers notified once, with all fields reset
}
```

</Section>
