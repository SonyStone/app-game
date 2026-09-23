import { err, ok, Result, ResultAsync, safeTry } from 'neverthrow';
import {
  checkAborted,
  errorMessage,
  gpuError,
  type AbortedError,
  type GpuError,
  type ResultValue
} from '../../../shared/errors';
import type { GpuContext } from '../../../shared/gpu/context';
import { createGpuResources } from '../../../shared/gpu/resources';
import { renderScene } from '../../scene/renderScene';
import type { TextDocument } from '../document';
import type { SceneFrame } from './createFrame';
import { prepareDocument } from './prepareDocument';

/** Prepares a document using borrowed GPU resources. Disposal releases only this document's allocations. */
export async function createTypeGpuRenderer(gpu: GpuContext, document: TextDocument, signal?: AbortSignal) {
  const { device } = gpu;
  const resources = createGpuResources();
  let destroyed = false;

  const destroy = () => {
    if (destroyed) {
      return;
    }

    destroyed = true;
    gpu.signal.removeEventListener('abort', destroy);
    signal?.removeEventListener('abort', destroy);
    resources.destroy();
  };

  const checkActive = (): Result<void, GpuError | AbortedError> => {
    const active = checkAborted(signal);
    if (active.isErr()) {
      return active;
    }

    return destroyed ? err(gpuError('destroyed', 'The document renderer has been destroyed')) : gpu.checkActive();
  };

  gpu.signal.addEventListener('abort', destroy, { once: true });
  signal?.addEventListener('abort', destroy, { once: true });

  const result = await safeTry(async function* () {
    yield* checkActive();

    const prepared = yield* await ResultAsync.fromThrowable(
      async () => {
        device.pushErrorScope('validation');

        const prepared = await ResultAsync.fromThrowable(
          () => prepareDocument({ ...gpu, checkActive }, document, resources.keep),
          (cause) => gpuError('device', errorMessage(cause), cause)
        )();

        const validation = await device.popErrorScope();
        if (prepared.isErr()) {
          return err(prepared.error);
        }

        return validation ? err(gpuError('validation', validation.message, validation)) : prepared.value;
      },
      (cause) => gpuError('device', errorMessage(cause), cause)
    )();

    const preparation = yield* prepared;
    const { draw: drawDocument } = preparation;
    const events = preparation.events;
    let standaloneFrame: SceneFrame | undefined;

    yield* checkActive();

    const draw = (pass: GPURenderPassEncoder, frame: SceneFrame) =>
      checkActive().andThen(() => {
        if (preparation.failure) {
          return err(preparation.failure);
        }

        return Result.fromThrowable(
          () => drawDocument(pass, frame),
          (cause) => gpuError('render', errorMessage(cause), cause)
        )();
      });

    return ok({
      /** Estimated explicit buffer and texture bytes, excluding driver overhead and swapchain. */
      get resourceBytes() {
        return preparation.resourceBytes;
      },
      /** Optional composed-page counters for performance and in-motion quality diagnostics. */
      get refinement() {
        return 'refinement' in preparation ? preparation.refinement : undefined;
      },
      /** Image uploads notify owner-managed frame subscriptions. */
      events,

      /** Releases document buffers/textures. The providers retain their device and canvas. */
      destroy,

      /** Waits for submitted GPU work and returns any completion or lifetime failure. */
      settle() {
        return ResultAsync.fromThrowable(
          async () => {
            const active = checkActive();

            if (active.isErr()) {
              return active;
            }

            await preparation.settle();

            if (standaloneFrame && checkActive().isOk()) {
              const rendered = renderScene(gpu, [({ pass }) => draw(pass, standaloneFrame!)]);

              if (rendered.isErr()) {
                return rendered;
              }
            }

            await device.queue.onSubmittedWorkDone();
            return ok<void>(undefined);
          },
          (cause) => gpuError('render', errorMessage(cause), cause)
        )()
          .andThen((result) => result)
          .andThen(() => checkActive())
          .andThen(() => (preparation.failure ? err(preparation.failure) : ok<void>(undefined)));
      },

      /** Records document draws in a scene-owned pass without clearing, ending or submitting it. */
      draw,

      /** Standalone rendering for callers outside JSX; the shared scene helper owns the pass. */
      render(frame: SceneFrame) {
        standaloneFrame = frame;
        return renderScene(gpu, [({ pass }) => draw(pass, frame)]);
      }
    });
  });

  const active = checkActive();
  if (result.isErr() || active.isErr()) {
    destroy();
  }

  return active.isErr() ? err(active.error) : result;
}

/** A prepared document renderer, independent of Solid and pointer input. */
export type TextRenderer = ResultValue<Awaited<ReturnType<typeof createTypeGpuRenderer>>>;
