import type { JSX } from '@solidjs/web';
import { createContext, Show, untrack, useContext } from 'solid-js';
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
      {(canvas) => (
        <CanvasSession canvas={canvas} error={props.error}>
          {props.children}
        </CanvasSession>
      )}
    </Show>
  );
}

/** Reads the configured canvas beneath GpuCanvasProvider. A missing provider is a programming error. */
export function useGpuCanvas() {
  return useContext(CanvasContext);
}

function CanvasSession(props: {
  canvas: HTMLCanvasElement;
  children: JSX.Element;
  error: (error: GpuError) => JSX.Element;
}) {
  const result = createGpuCanvas(
    useTypeGPURoot(),
    untrack(() => props.canvas)
  );

  if (result.isErr()) {
    return props.error(result.error);
  }

  return <CanvasContext value={result.value}>{props.children}</CanvasContext>;
}

const CanvasContext = createContext<GpuContext>();
