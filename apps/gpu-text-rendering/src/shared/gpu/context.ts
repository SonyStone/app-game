import { err, ok, Result } from 'neverthrow';
import { errorMessage, gpuError, type AbortedError, type GpuError, type ResultValue } from '../errors';
import type { GpuRoot } from './createGpuRoot';
import { onGpuRelease } from './onGpuRelease';

/** Configures a borrowed device's canvas for the current Solid owner. Does not destroy the device/root. */
export function createGpuCanvas(gpu: GpuRoot, canvas: HTMLCanvasElement) {
  const abort = new AbortController();
  let context: GPUCanvasContext | null = null;

  onGpuRelease(gpu.signal, destroy);

  const active = gpu.checkActive();
  if (active.isErr()) {
    destroy();
    return err(active.error);
  }

  const configured = Result.fromThrowable(
    () => {
      context = canvas.getContext('webgpu');
      if (!context) {
        return err(gpuError('canvas', 'Unable to create a WebGPU canvas'));
      }

      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device: gpu.device, format, alphaMode: 'opaque' });

      return ok({
        root: gpu.root,
        device: gpu.device,
        context,
        format,
        signal: abort.signal,
        checkActive(): Result<void, GpuError | AbortedError> {
          const active = gpu.checkActive();
          if (active.isErr()) {
            return active;
          }

          return abort.signal.aborted ? err(gpuError('destroyed', 'The GPU canvas has been detached')) : ok();
        }
      });
    },
    (cause) => gpuError('canvas', errorMessage(cause), cause)
  )();

  const result = configured.isErr() ? err(configured.error) : configured.value;
  if (result.isErr()) {
    destroy();
  }

  return result;

  function destroy() {
    if (abort.signal.aborted) {
      return;
    }

    abort.abort();
    context?.unconfigure();
  }
}

/** Borrowed rendering resources; the root and canvas providers own their lifetimes. */
export type GpuContext = ResultValue<ReturnType<typeof createGpuCanvas>>;

/**
 * The device-level part of a GPU context: enough to allocate resources and compile pipelines for canvases configured
 * with `format`, without a canvas. Resources prepared with it can be drawn into any canvas of the same device.
 */
export type GpuDevice = Pick<GpuContext, 'root' | 'device' | 'format' | 'signal' | 'checkActive'>;
