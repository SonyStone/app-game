import { createResizeObserver } from '@solid-primitives/resize-observer';
import { createContextProvider2 } from '@utils/createContextProvider';
import { ComponentProps, createEffect, createSignal, JSX, splitProps } from 'solid-js';
import { GPUProvider, useGPU } from './GPU.provider';
import { GPUCanvasContextProvider } from './GPUCanvasContext.provider';
import { TypeGPUCanvasContextProvider, useTypeGPUCanvasContext } from './TypeGPUCanvasContext.provider';
import { TypeGPURootProvider, useTypeGPURoot } from './TypeGPURoot.provider';

const [Provider, use] = createContextProvider2({
  factoryFn: (props: { pixelScale: number }) => {
    const gpu = useGPU();
    const root = useTypeGPURoot();
    const context = useTypeGPUCanvasContext();
    const canvas = context.canvas;
    const presentationFormat = gpu.getPreferredCanvasFormat();

    const [size, setSize] = createSignal<{ width: number; height: number }>(
      {
        width: canvas.width,
        height: canvas.height
      },
      { equals: (a, b) => a.width === b.width && a.height === b.height }
    );

    // @ts-expect-error HTMLCanvasElement is an Element
    createResizeObserver(canvas, (rect) => {
      const width = Math.max(1, Math.min(rect.width, root.device.limits.maxTextureDimension2D));
      const height = Math.max(1, Math.min(rect.height, root.device.limits.maxTextureDimension2D));
      setSize({ width, height });
    });

    createEffect(() => {
      const { width, height } = size();

      canvas.width = width / props.pixelScale;
      canvas.height = height / props.pixelScale;
    });

    return { gpu, root, context, canvas, presentationFormat, size };
  }
});

/**
 * Represents such a boilerplate code for initializing TypeGPU:
 * ```ts
 * const gpu = navigator.gpu;
 *
 * const adapter = await navigator.gpu?.requestAdapter();
 * const device = await adapter?.requestDevice();
 * const root = tgpu.init({
 *  device,
 *  adapter,
 * });
 *
 * const context = canvas.getContext('webgpu');
 * const presentationFormat = gpu.getPreferredCanvasFormat();
 * context.configure({
 *   device: root.device,
 *   format: presentationFormat,
 *   alphaMode: 'premultiplied',
 *   ...configuration
 * });
 *
 * return { context, gpu, root, canvas, presentationFormat }
 * ```
 *
 */
export const useTypeGPU = use;

export function TypeGPUProvider(
  props: Partial<{ children: JSX.Element; pixelScale: number }> & ComponentProps<'canvas'>
) {
  const [local, canvasProps] = splitProps(props, ['children', 'pixelScale']);

  const loading = <div>Initializing TypeGPU...</div>;
  const error = <div>Error initializing TypeGPU</div>;
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement | undefined>(undefined);

  return (
    <GPUProvider noGPU={error}>
      <TypeGPURootProvider loading={loading} error={error}>
        <canvas ref={setCanvas} {...canvasProps} />
        <GPUCanvasContextProvider canvas={canvas()} noWebGPUContext={error} noCanvas={error}>
          <TypeGPUCanvasContextProvider>
            <Provider pixelScale={local.pixelScale ?? 1}>{local.children}</Provider>
          </TypeGPUCanvasContextProvider>
        </GPUCanvasContextProvider>
      </TypeGPURootProvider>
    </GPUProvider>
  );
}
