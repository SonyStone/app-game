import { ComponentProps, createSignal } from 'solid-js';
import { Props } from './Props';

export function PropsProxyExample7() {
  const [counter, setCounter] = createSignal(0);
  const [useProxy, setUseProxy] = createSignal(true);

  return (
    <div class="flex flex-col gap-3 bg-neutral-950 p-2 text-white">
      <div class="flex gap-2">
        <Props
          id="input"
          class="rounded border border-neutral-700 bg-neutral-900 p-1 text-white"
          value={counter()}
          onInput={(event: InputEvent & { currentTarget: HTMLInputElement }) => {
            const value = Number(event.currentTarget.value);

            if (!Number.isNaN(value)) {
              setCounter(value);
            }
          }}
          onClick={(event: MouseEvent & { currentTarget: HTMLInputElement }) => {
            console.log('onClick:', event.currentTarget.value);
          }}
          data-proxy={useProxy()}
        >
          {(props: ComponentProps<'input'>) => <input {...props} />}
        </Props>

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
