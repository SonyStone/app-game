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
import type { KeepGpuResource } from '../../../shared/gpu/resources';
import { makeGpuResources } from '../../../shared/gpu/resources';
import { serializeGpuPreparation } from '../../../shared/gpu/serializeGpuPreparation';
import { renderScene } from '../../scene/renderScene';
import type { TextDocument } from '../document';
import type { SceneFrame } from './createFrame';
import { prepareCurveDocument } from './curves/prepareCurveDocument';
import type { DocumentWorkers } from './DocumentWorkers';
import { prepareGlyphDocument } from './prepareGlyphDocument';

/**
 * Prepares a document using borrowed GPU resources. Disposal releases only this document's allocations.
 * An initial frame limits image/page prewarming to its visible pages; omitted prewarms the whole document.
 * New pages load on first visit. settle() waits for the current visible work, not every offscreen resource.
 */
export async function createTypeGpuRenderer(
  gpu: GpuContext,
  document: TextDocument,
  {
    workers,
    signal,
    initialFrame
  }: {
    /** Workers owned by the caller; the renderer never destroys them. */
    workers: DocumentWorkers;
    /** Aborting cancels preparation, or destroys the renderer once prepared. */
    signal?: AbortSignal;
    /** Visible frame used to limit prewarming; omitted prewarms the whole document. */
    initialFrame?: SceneFrame;
  }
) {
  const { device } = gpu;
  const resources = makeGpuResources();
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
      () =>
        serializeGpuPreparation(device, async () => {
          const active = checkActive();
          if (active.isErr()) {
            return err(active.error);
          }
          // The scope stays open across preparation's awaits; scopes are device-wide, so it would also capture
          // unrelated work. Wrapping only synchronous segments would reach into every preparation step, so
          // instead serializeGpuPreparation keeps one preparation per device and FrameLoop defers frames
          // until it settles (pendingGpuPreparation).
          device.pushErrorScope('validation');

          const prepared = await ResultAsync.fromThrowable(
            () => prepareDocument({ ...gpu, checkActive }, document, resources.keep, workers, initialFrame),
            (cause) => gpuError('device', errorMessage(cause), cause)
          )();

          const validation = await device.popErrorScope();
          if (prepared.isErr()) {
            return err(prepared.error);
          }

          return validation ? err(gpuError('validation', validation.message, validation)) : prepared.value;
        }),
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
        return preparation.refinement;
      },
      /** Image uploads notify owner-managed frame subscriptions. */
      events,

      /** Releases document buffers/textures. The providers retain their device and canvas. */
      destroy,

      /** Waits for submitted GPU work and returns any completion or lifetime failure. */
      settle() {
        return safeTry(async function* () {
          yield* checkActive();
          yield* await renderStep(() => preparation.settle());

          if (standaloneFrame && checkActive().isOk()) {
            yield* renderScene(gpu, [({ pass }) => draw(pass, standaloneFrame!)]);
          }

          yield* await renderStep(() => device.queue.onSubmittedWorkDone());
          yield* checkActive();
          return preparation.failure ? err(preparation.failure) : ok<void>(undefined);
        });
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

/** Dispatches to the document profile's renderer; both satisfy the `PreparedDocument` contract. */
function prepareDocument(
  gpu: GpuContext,
  document: TextDocument,
  keep: KeepGpuResource,
  workers: DocumentWorkers,
  initialFrame: SceneFrame | undefined
) {
  return document.kind === 'curves'
    ? prepareCurveDocument(gpu, document, keep, workers, initialFrame)
    : prepareGlyphDocument(gpu, document, keep);
}

/** Awaits a completion step, reporting a rejection as a typed render error. */
function renderStep(step: () => Promise<void>) {
  return ResultAsync.fromThrowable(step, (cause) => gpuError('render', errorMessage(cause), cause))();
}
