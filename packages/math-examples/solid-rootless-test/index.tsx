import createRAF from '@solid-primitives/raf';
import { createRootPool } from '@solid-primitives/rootless';
import { createEffect, createSignal, Show, untrack } from 'solid-js';

export default function SolidRootlessTest() {
  return (
    <div class="flex flex-col gap-4 p-2">
      <div>Solid Rootless Test Example</div>
      <CreateRootPoolExample />
    </div>
  );
}

// createRoot(() => {

// })

// const owner = getOwner()

function CreateRootPoolExample() {
  // ❓ Created once and reused for each mount/unmount
  const useCounter1 = createRootPool((arg: () => number, active = () => true, dispose = () => {}) => {
    const [count, setCount] = createSignal<number>(arg());

    createEffect(() => {
      if (!active()) return;
      // so some side effect
      console.log('count', count());
    });

    return (
      <button
        class="flex select-none place-items-center gap-2 overflow-hidden rounded bg-amber-200 ps-2"
        onClick={() => setCount(count() + 1)}
      >
        Count: {count()}
        <img height={30} width={30} src={`https://api.dicebear.com/6.x/thumbs/svg?seed=${count()}`} />
      </button>
    );
  });

  // ❓ Created each time for each mount/unmount
  function useCounter2(initialCount: number) {
    const [count, setCount] = createSignal<number>(initialCount);

    return (
      <button
        class="flex select-none place-items-center gap-2 overflow-hidden rounded bg-amber-200 ps-2"
        onClick={() => setCount(count() + 1)}
      >
        Count: {count()}
        <img height={30} width={30} src={`https://api.dicebear.com/6.x/thumbs/svg?seed=${count()}`} />
      </button>
    );
  }

  const [frequentlyChangedCondition, setFrequentlyChangedCondition] = createSignal(true);
  const [running, start, stop] = createRAF((t: number) => {
    setFrequentlyChangedCondition(!!((t * 10) % 10));
  });
  start();

  return (
    <div class="flex flex-col gap-2 place-self-start border p-4">
      <pre>createRootPool</pre>
      <button
        class="mb-4 rounded bg-blue-500 px-4 py-2 text-white"
        onClick={() => (untrack(running) ? stop() : start())}
      >
        Toggle frequentlyChangedCondition {running() ? '⏸️' : '▶️'}
      </button>
      <span>Created once and reused for each mount/unmount</span>
      <div class="h-6">
        <Show when={frequentlyChangedCondition()}>{useCounter1(1)}</Show>
        <Show when={false}>
          <Show when={frequentlyChangedCondition()}>{useCounter2(1)}</Show>
        </Show>
      </div>
    </div>
  );
}
