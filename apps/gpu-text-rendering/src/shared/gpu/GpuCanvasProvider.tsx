import type { JSX } from '@solidjs/web';
import { createContext, Show, useContext } from 'solid-js';
import type { GpuError } from '../errors';
import { createGpuCanvas, type GpuContext } from './context';
import { useTypeGPURoot } from './TypeGPURootProvider';

/** Configures each canvas under a ready root; replacing/removing it disposes the rendering subtree. */
export function GpuCanvasProvider(props: {
  canvas: HTMLCanvasElement | undefined;
  children: JSX.Element;
  error: (error: GpuError) => JSX.Element;
}) {
  return (
    <Show when={props.canvas} keyed>
      {(canvas) => {
        const result = createGpuCanvas(useTypeGPURoot(), canvas);
        return result.match(
          (value) => <CanvasContext value={value}>{props.children}</CanvasContext>,
          props.error
        );
      }}
    </Show>
  );
}

/** Reads the configured canvas beneath GpuCanvasProvider. A missing provider is a programming error. */
export function useGpuCanvas() {
  return useContext(CanvasContext);
}

const CanvasContext = createContext<GpuContext>();
