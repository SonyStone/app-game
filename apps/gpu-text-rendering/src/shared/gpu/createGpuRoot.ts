import { err, ok, type Result } from 'neverthrow';
import { createEffect, createSignal, type Accessor } from 'solid-js';
import tgpu, { type TgpuRoot } from 'typegpu';
import { errorMessage, gpuError, type GpuError } from '../errors';

/** Owns one device/root per buffer requirement. Late devices are destroyed after disposal or replacement. */
export function createGpuRoot(requiredBufferBytes: Accessor<number>) {
  const [state, setState] = createSignal<GpuRootState>({ status: 'loading' }, { ownedWrite: true });

  createEffect(requiredBufferBytes, (bufferBytes) => {
    const abort = new AbortController();
    let device: GPUDevice | undefined;
    let root: TgpuRoot | undefined;
    let failure: GpuError | undefined;
    let stage: GpuError['code'] = 'adapter';

    setState({ status: 'loading' });

    // Browser and TypeGPU exceptions meet one rejection boundary. Expected failures use fail directly.
    void initialize().catch((cause: unknown) => fail(gpuError(stage, errorMessage(cause), cause)));

    return destroy;

    async function initialize() {
      if (!globalThis.navigator?.gpu) {
        return fail(gpuError('unavailable', 'WebGPU is unavailable in this browser'));
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (abort.signal.aborted) {
        return;
      }
      if (!adapter) {
        return fail(gpuError('adapter', 'No WebGPU adapter is available'));
      }

      const maxBufferSize = Math.max(256 * 1024 * 1024, bufferBytes);
      if (maxBufferSize > adapter.limits.maxBufferSize) {
        return fail(gpuError('buffer-limit', 'The document exceeds the GPU buffer limit'));
      }

      stage = 'device';
      const acquiredDevice = await adapter.requestDevice({ requiredLimits: { maxBufferSize } });
      if (abort.signal.aborted) {
        acquiredDevice.destroy();
        return;
      }

      device = acquiredDevice;
      root = tgpu.initFromDevice({ device });

      device.addEventListener('uncapturederror', handleError);
      void device.lost.then((info) => fail(gpuError('lost', info.message || 'WebGPU device lost', info)));

      setState({
        status: 'ready',
        gpu: {
          root,
          device,
          signal: abort.signal,
          checkActive() {
            if (failure) {
              return err(failure);
            }

            return abort.signal.aborted ? err(gpuError('destroyed', 'The GPU root has been destroyed')) : ok();
          }
        }
      });
    }

    function handleError(event: GPUUncapturedErrorEvent) {
      fail(gpuError('validation', event.error.message, event.error));
    }

    function fail(error: GpuError) {
      if (abort.signal.aborted) {
        return;
      }

      failure = error;
      destroy();

      setState({ status: 'error', error });
    }

    function destroy() {
      if (abort.signal.aborted) {
        return;
      }

      // Stop descendants synchronously, before releasing their device.
      abort.abort();
      device?.removeEventListener('uncapturederror', handleError);
      root?.destroy();
      device?.destroy();
    }
  });

  return state;
}

/** Only ready roots enter the provider context; loading and failure stay in JSX branches. */
export type GpuRootState =
  | { status: 'loading' }
  | { status: 'error'; error: GpuError }
  | { status: 'ready'; gpu: GpuRoot };

/** Borrowed device/root. The provider retains ownership; consumers observe cancellation through signal. */
export type GpuRoot = {
  root: TgpuRoot;
  device: GPUDevice;
  signal: AbortSignal;
  checkActive: () => Result<void, GpuError>;
};
