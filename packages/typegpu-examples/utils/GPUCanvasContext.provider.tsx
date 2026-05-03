// @refresh reload

import { createContextProvider } from '@app-game/solid-utils';
import { JSX, mergeProps, Show } from 'solid-js';

const [Provider, useGPUCanvasContext] = createContextProvider<GPUCanvasContext, { value: GPUCanvasContext }>(
  (props) => props.value,
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
  props = mergeProps(defaultProps, props);

  return (
    <Show when={props.canvas} fallback={props.noCanvas}>
      {(canvas) => (
        <Show when={canvas().getContext('webgpu')} fallback={props.noWebGPUContext}>
          {(canvasContext) => <Provider value={canvasContext()}>{props.children}</Provider>}
        </Show>
      )}
    </Show>
  );
}
