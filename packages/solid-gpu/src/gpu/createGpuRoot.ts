import { err, ok, type Result } from 'neverthrow';
import { createEffect, createSignal, type Accessor } from 'solid-js';
import tgpu, { type TgpuRoot } from 'typegpu';
import { errorMessage, gpuError, type GpuError } from '../errors';

/**
 * Owns one device/root per buffer requirement. Late devices are destroyed after disposal or replacement.
 * Unexpected device loss aborts the old root, returns to loading and requests a new device, so dependents remount
 * on the new root. After maxDeviceRecoveries losses for one buffer requirement, loss becomes a terminal error.
 * An external device.destroy() and uncaptured validation errors are terminal. Every device also enables those of
 * `optionalFeatures` its adapter supports; callers check `device.features` before relying on one.
 */
export function createGpuRoot(requiredBufferBytes: Accessor<number>, optionalFeatures: readonly GPUFeatureName[] = []) {
  const [state, setState] = createSignal<GpuRootState>({ status: 'loading' }, { ownedWrite: true });
  // Bumped to re-run initialization after device loss; reset with each buffer requirement.
  const [attempt, setAttempt] = createSignal(0, { ownedWrite: true });
  let recoveries = 0;
  let recoveredBytes: number | undefined;

  createEffect(
    () => ({ bufferBytes: requiredBufferBytes(), attempt: attempt() }),
    ({ bufferBytes }) => {
      if (bufferBytes !== recoveredBytes) {
        recoveredBytes = bufferBytes;
        recoveries = 0;
      }
      return initializeRoot(bufferBytes);
    }
  );

  return state;

  /** Requests an adapter, device and root. Returns the disposer that releases them. */
  function initializeRoot(bufferBytes: number) {
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
      const acquiredDevice = await adapter.requestDevice({
        requiredLimits: { maxBufferSize },
        requiredFeatures: optionalFeatures.filter((feature) => adapter.features.has(feature))
      });
      if (abort.signal.aborted) {
        acquiredDevice.destroy();
        return;
      }

      device = acquiredDevice;
      root = tgpu.initFromDevice({ device });

      device.addEventListener('uncapturederror', handleError);
      void device.lost.then(handleLoss);

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

    function handleLoss(info: GPUDeviceLostInfo) {
      // Our own disposal or replacement aborts first, so its 'destroyed' loss is ignored.
      if (abort.signal.aborted) {
        return;
      }

      // An external destroy() is deliberate; only unexpected loss is worth a new device.
      const error = gpuError('lost', info.message || 'WebGPU device lost', info);
      if (info.reason === 'destroyed' || recoveries >= maxDeviceRecoveries) {
        fail(error);
        return;
      }

      recoveries++;
      // Stop dependents at once; the re-run effect disposes this attempt and publishes loading, then a new root.
      failure = error;
      destroy();
      setAttempt((value) => value + 1);
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
  }
}

/** Device losses recovered per buffer requirement before loss is reported as a terminal error. */
export const maxDeviceRecoveries = 3;

/** Only ready roots enter the provider context; loading and failure stay in JSX branches. */
export type GpuRootState =
  | { status: 'loading' }
  | { status: 'error'; error: GpuError }
  | { status: 'ready'; gpu: GpuRoot };

/** Borrowed device/root. The provider retains ownership; consumers observe cancellation through signal. */
export type GpuRoot = {
  /** TypeGPU root created from device. */
  root: TgpuRoot;
  /** The device; destroyed when this root is replaced, lost or disposed. */
  device: GPUDevice;
  /** Aborts synchronously before the device is released, including on loss. */
  signal: AbortSignal;
  /** Err with the loss/validation failure, or 'destroyed' after replacement or disposal. */
  checkActive: () => Result<void, GpuError>;
};
