import { createContextProvider } from '@utils/createContextProvider';
import { JSX, mergeProps, Show } from 'solid-js';

/**
 * Check if the browser supports WebGPU
 * And provide the GPU non null object.
 */
const [Provider, useWebGPU] = createContextProvider<GPU>();
export { useWebGPU };

const defaultProps = {
  fallback: <div>Your browser does not support WebGPU.</div>
};

export function WebGPUProvider(props: Partial<{ children: JSX.Element; noGPU?: JSX.Element }>) {
  props = mergeProps(defaultProps, props);

  return (
    <Show when={navigator.gpu} fallback={props.noGPU}>
      {(gpu) => <Provider value={gpu()}>{props.children}</Provider>}
    </Show>
  );
}
