<Page
title="Batching & Untrack"
badge="Core"
description="batch() groups multiple signal updates into a single notification. untrack() reads reactive values without creating a dependency."

>

  <Section
    title="batch()"
    description="Without batch, each setX() call triggers separate effect runs. batch defers notifications until the function completes."
  >

```ts
import { batch, createEffect, createSignal } from 'solid-js';

const [x, setX] = createSignal(0);
const [y, setY] = createSignal(0);

createEffect(() => console.log(x(), y()));

// Without batch - effect runs twice
setX(1); // effect: 1, 0
setY(1); // effect: 1, 1

// With batch - effect runs once
batch(() => {
  setX(2); // queued
  setY(2); // queued
}); // effect: 2, 2 (single run)
```

  </Section>

  <Section title="Live Demo: batch">
    <BatchDemo />
  </Section>

  <Section
    title="untrack()"
    description="Reads reactive values without subscribing. Use inside effects or memos to access data without triggering re-runs."
  >

```ts
import { createSignal, createEffect, untrack } from 'solid-js';

const [trigger, setTrigger] = createSignal(0);
const [data, setData] = createSignal('hello');

// Effect only re-runs when trigger changes
createEffect(() => {
  trigger(); // subscribed

  // Read data without subscribing - won't re-run when data changes
  const snapshot = untrack(() => data());
  console.log('triggered, data snapshot:', snapshot);
});
```

  </Section>

  <Callout type="info" title="batch is automatic in event handlers">
    SolidJS automatically batches updates in DOM event handlers (onClick, onInput, etc.). You only need explicit <code>
      batch()
    </code> for async contexts like setTimeout, fetch callbacks, or WebSocket handlers.
  </Callout>

  <Section
    title="Practical: multi-field form reset"
    description="batch is ideal for resetting multiple fields at once without intermediate effect runs."
  >

```ts
const [name, setName] = createSignal('');
const [email, setEmail] = createSignal('');
const [age, setAge] = createSignal(0);

function resetForm() {
  batch(() => {
    setName('');
    setEmail('');
    setAge(0);
  });
  // Subscribers notified once, with all fields reset
}
```

  </Section>
</Page>
