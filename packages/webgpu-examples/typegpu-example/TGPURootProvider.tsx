import { createContextProvider } from '@utils/createContextProvider';
import { createResource, JSX, onCleanup, Show } from 'solid-js';
import tgpu, { TgpuRoot } from 'typegpu';

const [Provider, useTGPURoot] = createContextProvider<TgpuRoot>();
export { useTGPURoot };
export function TGPURootProvider(props: Partial<{ children: JSX.Element }>) {
  const [root] = createResource(() => tgpu.init());

  onCleanup(() => {
    root()?.destroy();
  });

  return <Show when={root()}>{(root) => <Provider value={root()}>{props.children}</Provider>}</Show>;
}
