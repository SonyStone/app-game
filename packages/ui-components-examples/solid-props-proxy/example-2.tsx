import { createSpread } from '@app-game/solid-props-proxy';
import type { Props } from '@app-game/solid-props-proxy/types';
import type { JSX } from '@solidjs/web';
import { createSignal, Show } from 'solid-js';

/**
 * A simple example of PropsProxy
 */
export function PropsProxyExample2() {
  const [ref, setRef] = createSignal<HTMLInputElement | null>(null);

  const [counter, setCounter] = createSignal(0);

  const [useProxy, setUseProxy] = createSignal(true);

  return (
    <div class="flex flex-col gap-3 bg-neutral-950 p-2 text-white">
      <div class="flex gap-2">
        <input ref={setRef} value={counter()} class="rounded border border-neutral-700 bg-neutral-900 p-1 text-white" />
        <button
          class="rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-700"
          onClick={() => {
            setCounter((prev) => prev + 1);
          }}
        >
          Counter: {counter()}
        </button>
        <button
          class="rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-700"
          onClick={() => setUseProxy((prev) => !prev)}
        >
          Use PropsProxy {useProxy() ? 'ON' : 'OFF'}
        </button>
      </div>
      <Show when={useProxy()}>
        <TestProxy component={ref()} />
      </Show>
    </div>
  );
}

function TestProxy<T extends Element>(
  props: { component: T | null } & (T extends Element ? JSX.HTMLAttributes<T> : Record<string, unknown>)
) {
  const spread = createSpread(() => props.component);
  spread({
    'data-proxy': 'true',
    value: 'Not a number'
  } as unknown as Props<T>);

  return null;
}
