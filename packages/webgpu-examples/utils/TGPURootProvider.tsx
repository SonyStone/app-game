import { createContextProvider } from '@utils/createContextProvider';
import { createResource, JSX, Match, mergeProps, onCleanup, Switch } from 'solid-js';
import tgpu, { TgpuRoot } from 'typegpu';
import { useWebGPU } from './WebGPUProvider';

const [Provider, useTGPURoot] = createContextProvider<TgpuRoot>();
export { useTGPURoot };

const defaultProps = {
  loading: <div>Loading TypeGPU...</div>,
  error: <div>Error initializing TypeGPU</div>
};

export function TGPURootProvider(
  props: Partial<{ children: JSX.Element; loading?: JSX.Element; error?: JSX.Element }>
) {
  props = mergeProps(defaultProps, props);

  // Just to make sure WebGPU is available at this point
  const gpu = useWebGPU();
  const [root] = createResource(gpu, () => tgpu.init());

  onCleanup(() => {
    root()?.destroy();
  });

  return (
    <Switch>
      <Match when={root.error}>{props.error}</Match>
      <Match when={root.loading}>{props.loading}</Match>
      <Match when={root()}>{(root) => <Provider value={root()}>{props.children}</Provider>}</Match>
    </Switch>
  );
}
