import { createContextProvider } from '@app-game/solid-utils';
import { JSX, onCleanup, splitProps } from 'solid-js';
import { useGPU } from './GPU.provider';
import { useGPUCanvasContext } from './GPUCanvasContext.provider';
import { useTypeGPURoot } from './TypeGPURoot.provider';

/**
 * checks:
 * - `gpu = navigator.gpu`
 * - `root = tgpu.init()` | `root.destroy()`
 * - `canvas`
 * - `ctx = canvas.getContext('webgpu')`
 * - `ctx.configure()` | `ctx.unconfigure()`
 */
const [Provider, useTypeGPUCanvasContext] = createContextProvider<
  GPUCanvasContext,
  {
    value: GPUCanvasContext;
  }
>((props) => props.value, {
  errorMessage: 'TypeGPUCanvasContextProvider is missing'
});

export { useTypeGPUCanvasContext };

export function TypeGPUCanvasContextProvider(
  props: Partial<{ children: JSX.Element }> & Omit<GPUCanvasConfiguration, 'device' | 'format'>
) {
  const [local, configuration] = splitProps(props, ['children']);

  const gpu = useGPU();
  const root = useTypeGPURoot();
  const context = useGPUCanvasContext();
  const presentationFormat = gpu.getPreferredCanvasFormat();
  context.configure({
    device: root.device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
    ...configuration
  });

  onCleanup(() => {
    context.unconfigure();
  });

  return <Provider value={context}>{local.children}</Provider>;
}
