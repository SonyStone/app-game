// @refresh reload

import { createContextProvider } from '@utils/createContextProvider';
import { JSX, mergeProps, onCleanup, Show } from 'solid-js';

const [Provider, useGPUCanvasContext] = createContextProvider<GPUCanvasContext>(
  (props: { value: GPUCanvasContext }) => {
    const canvasContext = props.value;

    onCleanup(() => {
      canvasContext.unconfigure();
    });

    return canvasContext;
  }
);

export { useGPUCanvasContext };

const defaultProps = {
  noCanvas: <div>No canvas provided</div>,
  noWebGPUContext: <div>No WebGPU context available</div>
};

export function GPUCanvasContextProvider(
  props: Partial<{
    canvas: HTMLCanvasElement;
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
