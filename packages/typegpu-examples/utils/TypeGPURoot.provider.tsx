import { createContextProvider } from '@app-game/solid-utils';
import type { JSX } from '@solidjs/web';
import { createMemo, Errored, isPending, latest, Match, merge, onCleanup, Switch, untrack } from 'solid-js';
import tgpu, { TgpuRoot } from 'typegpu';
import { useGPU } from './GPU.provider';

const [Provider, useTypeGPURoot] = createContextProvider<TgpuRoot, { value: TgpuRoot }>(
  (props) => {
    const root = untrack(() => props.value);

    onCleanup(() => {
      root.destroy();
    });

    return root;
  },
  {
    errorMessage: 'TGPURootProvider is missing'
  }
);
export { useTypeGPURoot };

const defaultProps = {
  loading: <div>Loading TypeGPU...</div>,
  error: <div>Error initializing TypeGPU</div>
};

export function TypeGPURootProvider(
  props: Partial<{ children: JSX.Element; loading?: JSX.Element; error?: JSX.Element }>
) {
  props = merge(defaultProps, props);

  const gpu = useGPU();
  const root = createMemo(() => {
    void gpu;
    return tgpu.init();
  });

  return (
    <Errored fallback={props.error}>
      <Switch>
        <Match when={isPending(root)}>{props.loading}</Match>
        <Match when={latest(root)}>
          {(resolvedRoot) => <Provider value={untrack(resolvedRoot)}>{props.children}</Provider>}
        </Match>
      </Switch>
    </Errored>
  );
}
