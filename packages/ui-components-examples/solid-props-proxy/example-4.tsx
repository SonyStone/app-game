import { combineProps } from '@solid-primitives/props';
import { ReactiveSet } from '@solid-primitives/set';
import type { JSX } from '@solidjs/web';
import { Dynamic } from '@solidjs/web';
import { createSignal, createTrackedEffect, merge, omit, onCleanup, Show } from 'solid-js';

export function PropsProxyExample4() {
  const [target, setTarget] = createSignal<ProxyTargetHandle<HTMLInputElement> | null>(null);
  const [counter, setCounter] = createSignal(0);
  const [useProxy, setUseProxy] = createSignal(true);

  const _proxy = (
    <Show when={useProxy()}>
      <PropsDynamic
        target={target()}
        value="Not a number"
        class="border-red-700 shadow-[0_0_0_1px_var(--color-red-700)]"
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
        <CombineProps
          component="input"
          ref={setTarget}
          value={counter()}
          class="rounded border border-neutral-700 bg-neutral-900 p-1 text-white"
          onInput={(event: InputEvent & { currentTarget: HTMLInputElement }) => {
            const value = Number(event.currentTarget.value);

            if (!Number.isNaN(value)) {
              setCounter(value);
            }
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
          onClick={() => setUseProxy((prev) => !prev)}
        >
          Use PropsProxy {useProxy() ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}

const PROXY = Symbol('ProxyTargetHandle');

type SolidProps = Record<string, unknown>;

type ProxyTargetHandle<T extends Element> = T & {
  [PROXY]: (props: SolidProps) => VoidFunction;
};

function CombineProps(
  props: JSX.InputHTMLAttributes<HTMLInputElement> & {
    component: 'input';
    ref?: ((el: ProxyTargetHandle<HTMLInputElement> | null) => void) | undefined;
  }
) {
  const rest = omit(props, 'component', 'ref');

  const set = new ReactiveSet<SolidProps>([]);
  const combinedProps = combineProps(rest as SolidProps, ...set) as JSX.InputHTMLAttributes<HTMLInputElement>;

  return (
    <Dynamic
      component={props.component}
      {...combinedProps}
      ref={(element: HTMLInputElement | null | undefined) => {
        if (!element) {
          props.ref?.(null);
          return;
        }
        const target = element as ProxyTargetHandle<HTMLInputElement>;
        target[PROXY] = (props: SolidProps) => {
          set.add(props);
          return () => {
            set.delete(props);
          };
        };
        props.ref?.(target);
        onCleanup(() => {
          props.ref?.(null);
        });
      }}
    />
  );
}

function MergeProps(
  props: JSX.InputHTMLAttributes<HTMLInputElement> & {
    component: 'input';
    ref?: ((el: ProxyTargetHandle<HTMLInputElement> | null) => void) | undefined;
  }
) {
  const rest = omit(props, 'component', 'ref');

  const set = new ReactiveSet<SolidProps>([]);
  const mergedProps = merge(rest, ...set) as JSX.InputHTMLAttributes<HTMLInputElement>;

  return (
    <Dynamic
      component={props.component}
      {...mergedProps}
      ref={(element: HTMLInputElement | null | undefined) => {
        if (!element) {
          props.ref?.(null);
          return;
        }
        const target = element as ProxyTargetHandle<HTMLInputElement>;
        target[PROXY] = (props: SolidProps) => {
          set.add(props);
          return () => {
            set.delete(props);
          };
        };
        props.ref?.(target);
        onCleanup(() => {
          props.ref?.(null);
        });
      }}
    />
  );
}

function PropsDynamic<T extends Element>(
  props: { target: ProxyTargetHandle<T> | null | undefined } & SolidProps
): JSX.Element {
  const rest = omit(props, 'target');

  createTrackedEffect(() => {
    const target = props.target;

    if (!target?.[PROXY]) {
      return;
    }

    const cleanup = target[PROXY](rest);

    return cleanup;
  });

  return null;
}
