import { createContextProvider } from '@utils/createContextProvider';
import { createResource, JSX, Match, mergeProps, onCleanup, Switch } from 'solid-js';
import tgpu, { TgpuRoot } from 'typegpu';
import { useGPU } from './GPU.provider';

const [Provider, useTypeGPURoot] = createContextProvider<TgpuRoot, { value: TgpuRoot }>(
  (props) => {
    const root = props.value;

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
  props = mergeProps(defaultProps, props);

  const gpu = useGPU();
  const [root] = createResource(gpu, () => tgpu.init());

  return (
    <Switch>
      <Match when={root.error}>{props.error}</Match>
      <Match when={root.loading}>{props.loading}</Match>
      <Match when={root()}>{(root) => <Provider value={root()}>{props.children}</Provider>}</Match>
    </Switch>
  );
}
