// @refresh reload

import { createContextProvider } from '@app-game/solid-utils';
import type { JSX } from '@solidjs/web';
import { merge, Show, untrack } from 'solid-js';

const [Provider, useGPUCanvasContext] = createContextProvider<GPUCanvasContext, { value: GPUCanvasContext }>(
  (props) => untrack(() => props.value),
  {
    errorMessage: 'GPUCanvasContextProvider is missing'
  }
);

export { useGPUCanvasContext };

const defaultProps = {
  noCanvas: <div>No canvas provided</div>,
  noWebGPUContext: <div>No WebGPU context available</div>
};

export function GPUCanvasContextProvider(
  props: Partial<{
    canvas?: HTMLCanvasElement;
    children?: JSX.Element;
    noCanvas?: JSX.Element;
    noWebGPUContext?: JSX.Element;
  }>
) {
  props = merge(defaultProps, props);

  return (
    <Show when={props.canvas} fallback={props.noCanvas}>
      {(canvas) => (
        <Show when={canvas().getContext('webgpu')} fallback={props.noWebGPUContext}>
          {(canvasContext) => <Provider value={untrack(canvasContext)}>{props.children}</Provider>}
        </Show>
      )}
    </Show>
  );
}
