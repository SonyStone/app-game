import { combineProps } from '@solid-primitives/props';
import { ComponentProps, createSignal, mergeProps, Show } from 'solid-js';
import { Props } from './Props';

export function PropsProxyExample5() {
  const emptyProps = {};
  const [inputProps, setInputProps] = createSignal<ComponentProps<'input'>>(emptyProps);
  const [props, setProps] = createSignal<ComponentProps<'input'>>(emptyProps);
  const [counter, setCounter] = createSignal(0);
  const [useProxy, setUseProxy] = createSignal(true);

  const a = (
    <Props
      ref={(props: ComponentProps<'input'> | null) => setInputProps(props ?? emptyProps)}
      value={counter()}
      class="rounded border border-neutral-700 bg-neutral-900 p-1 text-white"
      onInput={(event: InputEvent & { currentTarget: HTMLInputElement }) => {
        const value = Number(event.currentTarget.value);

        if (!Number.isNaN(value)) {
          setCounter(value);
        }
      }}
    />
  );

  const b = (
    <Show when={useProxy()}>
      <Props
        ref={(props: ComponentProps<'input'> | null) => setProps(props ?? emptyProps)}
        value="Not a number"
        class="border-red-700 shadow-[0_0_0_1px_theme(colors.red.700)]"
        data-proxy
        onInput={(event: InputEvent & { currentTarget: HTMLInputElement }) => {
          console.log('Proxy onInput:', event.currentTarget.value);
        }}
      />
    </Show>
  );

  return (
    <div class="flex flex-col gap-3 bg-neutral-950 p-2 text-white">
      <div class="flex gap-2">
        <input {...mergeProps(inputProps, props)} />
        <input {...combineProps(inputProps, props)} />

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
