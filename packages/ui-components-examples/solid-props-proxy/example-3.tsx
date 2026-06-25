import { combineProps } from '@solid-primitives/props';
import { createEffect, createSignal, JSX, onCleanup, Show, splitProps } from 'solid-js';
import { Dynamic } from 'solid-js/web';

/**
 * Using a wraper around target component to make it work with PropsProxy
 */
export function PropsProxyExample3() {
  const [target, setTarget] = createSignal<ProxyTargetHandle<HTMLInputElement> | null>(null);
  const [counter, setCounter] = createSignal(0);
  const [useProxy, setUseProxy] = createSignal(true);

  const _proxy = (
    <Show when={useProxy()}>
      <PropsProxy
        target={target()}
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
        <ProxyTarget
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

type SolidProps = Record<string, unknown>;

type ProxyTargetHandle<T extends Element> = {
  element: () => T | null;
  addOverlay: (props: SolidProps) => VoidFunction;
};

function ProxyTarget(
  props: JSX.InputHTMLAttributes<HTMLInputElement> & {
    component: 'input';
    ref?: (handle: ProxyTargetHandle<HTMLInputElement> | null) => void;
  }
): JSX.Element {
  const [local, restProps] = splitProps(props, ['component', 'ref']);
  const [element, setElement] = createSignal<HTMLInputElement | null>(null);
  const [overlays, setOverlays] = createSignal<readonly SolidProps[]>([]);
  const setTargetElement = (nextElement: Element) => {
    setElement(() => nextElement as HTMLInputElement);
  };

  const handle: ProxyTargetHandle<HTMLInputElement> = {
    element,
    addOverlay: (overlayProps) => {
      setOverlays((current) => [...current, overlayProps]);

      return () => {
        setOverlays((current) => current.filter((entry) => entry !== overlayProps));
      };
    }
  };

  createEffect(() => {
    local.ref?.(handle);
  });

  onCleanup(() => {
    local.ref?.(null);
  });

  const combinedProps = combineProps(restProps, ...overlays()) as JSX.InputHTMLAttributes<HTMLInputElement>;

  return <Dynamic component={local.component} {...combinedProps} ref={setTargetElement} />;
}

function PropsProxy<T extends Element>(
  props: { target: ProxyTargetHandle<T> | null | undefined } & SolidProps
): JSX.Element {
  const [local, restProps] = splitProps(props, ['target']);

  createEffect(() => {
    const target = local.target;

    if (!target) {
      return;
    }

    const cleanup = target.addOverlay(restProps);
    onCleanup(cleanup);
  });

  return null;
}
