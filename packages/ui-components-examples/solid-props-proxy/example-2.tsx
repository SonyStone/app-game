import type { JSX } from '@solidjs/web';
import { spread } from '@solidjs/web';
import { createSignal, createTrackedEffect, omit, Show } from 'solid-js';

/**
 * A simple example of PropsProxy
 */
export function PropsProxyExample2() {
  const [ref, setRef] = createSignal<HTMLInputElement | null>(null);

  const [counter, setCounter] = createSignal(0);

  const [useProxy, setUseProxy] = createSignal(true);

  const b = (
    <Show when={useProxy()}>
      <TestProxy component={ref()} />
    </Show>
  );

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
    </div>
  );
}

function TestProxy<T extends Element>(
  props: { component: T | null } & (T extends Element ? JSX.HTMLAttributes<T> : Record<string, unknown>)
) {
  const restProps = omit(props, 'component');

  createTrackedEffect(() => {
    const target = props.component;
    if (!target) {
      return;
    }

    const record = target as unknown as Record<string, unknown>;
    const original = record['value'];

    const returns = spread(target, {
      'data-proxy': 'true',
      value: 'Not a number'
    });

    const applied = record['value'];

    return () => {
      target.removeAttribute('data-proxy');

      if (!Object.is(record['value'], applied)) {
        return;
      }

      record['value'] = original;
    };
  });

  return null;
}
