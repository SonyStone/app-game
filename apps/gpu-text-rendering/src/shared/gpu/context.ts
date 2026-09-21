import { err, ok, Result } from 'neverthrow';
import { onCleanup } from 'solid-js';
import { errorMessage, gpuError, type AbortedError, type GpuError, type ResultValue } from '../errors';
import type { GpuRoot } from './createGpuRoot';

/** Configures a borrowed device's canvas for the current Solid owner. Does not destroy the device/root. */
export function createGpuCanvas(gpu: GpuRoot, canvas: HTMLCanvasElement) {
  const abort = new AbortController();
  let context: GPUCanvasContext | null = null;

  onCleanup(destroy);
  gpu.signal.addEventListener('abort', destroy, { once: true });

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
    gpu.signal.removeEventListener('abort', destroy);
    context?.unconfigure();
  }
}

/** Borrowed rendering resources; the root and canvas providers own their lifetimes. */
export type GpuContext = ResultValue<ReturnType<typeof createGpuCanvas>>;
