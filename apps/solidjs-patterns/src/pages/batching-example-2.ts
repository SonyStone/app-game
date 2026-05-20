import { createSignal, createEffect, untrack } from 'solid-js';

const [trigger, setTrigger] = createSignal(0);
const [data, setData] = createSignal('hello');

// Effect only re-runs when trigger changes
createEffect(() => {
  trigger(); // subscribed

  // Read data without subscribing — won't re-run when data changes
  const snapshot = untrack(() => data());
  console.log('triggered, data snapshot:', snapshot);
});