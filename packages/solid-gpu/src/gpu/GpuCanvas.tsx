import type { JSX } from '@solidjs/web';
import type { GpuError } from '../errors';
import { GpuCanvasProvider } from './GpuCanvasProvider';
import { TypeGPURootProvider } from './TypeGPURootProvider';

/**
 * Requests a GPU device and configures `canvas` for it, mounting children once both are ready. Combines
 * TypeGPURootProvider and GpuCanvasProvider for apps with one canvas; use those directly to share a device between
 * canvases. Changing requiredBufferBytes or recovering from device loss replaces the subtree; replacing or removing
 * the canvas remounts or unmounts it.
 */
export function GpuCanvas(props: {
  /** Canvas to configure; undefined unmounts children. */
  canvas: HTMLCanvasElement | undefined;
  /** Minimum maxBufferSize to request (at least 256 MiB). Changing it requests a new device. */
  requiredBufferBytes: number;
  /** Features to enable on devices whose adapter supports them; read once. Default none. */
  optionalFeatures?: readonly GPUFeatureName[];
  /** Mounted beneath the root and canvas contexts while both are ready. */
  children: JSX.Element;
  /** Shown while requesting an adapter/device, including during loss recovery. Default nothing. */
  loading?: JSX.Element;
  /** Renders a device or canvas failure in place of children. */
  error: (error: GpuError) => JSX.Element;
}) {
  return (
    <TypeGPURootProvider
      requiredBufferBytes={props.requiredBufferBytes}
      optionalFeatures={props.optionalFeatures}
      loading={props.loading}
      error={props.error}
    >
      <GpuCanvasProvider canvas={props.canvas} error={props.error}>
        {props.children}
      </GpuCanvasProvider>
    </TypeGPURootProvider>
  );
}
