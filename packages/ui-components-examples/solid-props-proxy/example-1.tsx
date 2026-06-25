import { PropsProxy } from '@app-game/solid-props-proxy';
import { createMemo, createSignal, Show } from 'solid-js';

const testPropsArray = [
  {
    'attr-asd': '123'
  },
  {
    asdasdasd: 'asdasd',
    onInput: () => {
      console.log('asdasd input');
    }
  },
  {
    class: 'bg-red-400!',
    onClick: () => {
      console.log('whatttttt');
    }
  },
  {}
];

/**
 * Use PropsProxy to manage component props
 */
export function PropsProxyExample1() {
  const [ref, setRef] = createSignal<HTMLInputElement | null>(null);

  const [counter, setCounter] = createSignal(0);
  const [proxyCounter, setProxyCounter] = createSignal(12);
  const testProps = createMemo(() => {
    return testPropsArray[counter() % testPropsArray.length];
  });

  const [useProxy, setUseProxy] = createSignal(true);

  const a = (
    <Show when={useProxy()}>
      <PropsProxy
        target={ref()}
        class="border-red-700"
        onClick={() => {
          console.log('Proxy onClick');
        }}
        {...{ value: proxyCounter() + ' Not a number' }}
        {...testProps()}
      />
    </Show>
  );

  return (
    <div class="flex flex-col gap-3 bg-neutral-950 p-2 text-white">
      {a}
      <div class="flex gap-2">
        <input
          ref={setRef}
          class="rounded border border-neutral-700 bg-neutral-900 p-1 text-white"
          value={counter()}
          onInput={(event: InputEvent & { currentTarget: HTMLInputElement }) => {
            const value = Number(event.currentTarget.value);

            if (!Number.isNaN(value)) {
              setCounter(value);
            }
          }}
          onClick={() => {
            console.log('Input onClick');
          }}
        />
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
          onClick={() => {
            setProxyCounter((prev) => prev + 1);
          }}
        >
          Proxy Counter: {proxyCounter()}
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
