import {
  checkAborted,
  errorMessage,
  gpuError,
  type AbortedError,
  type GpuError,
  type ResultValue
} from '@app-game/solid-gpu/errors';
import {
  makeGpuResources,
  serializeGpuPreparation,
  type GpuContext,
  type GpuDevice,
  type KeepGpuResource
} from '@app-game/solid-gpu/gpu';
import { err, ok, Result, ResultAsync, safeTry } from 'neverthrow';
import { renderScene } from '../../scene/renderScene';
import type { TextDocument } from '../document';
import type { SceneFrame } from './createFrame';
import { prepareCurveDocument } from './curves/prepareCurveDocument';
import type { DocumentWorkers } from './DocumentWorkers';
import { prepareGlyphDocument } from './prepareGlyphDocument';

/**
 * Prepares a document with the engine for its kind on `gpu`'s device. `render` draws into `gpu`'s canvas for callers
 * outside JSX; JSX views draw into their own scene passes.
 */
export function createTypeGpuRenderer(
  gpu: GpuContext,
  document: TextDocument,
  options: Parameters<typeof createCurveRenderer>[2]
) {
  return createDeviceRenderer(gpu, document, { ...options, canvas: gpu });
}

/** Prepares a document with the engine for its kind on a device, to draw through views into any of its canvases. */
export function createDeviceRenderer(
  gpu: GpuDevice,
  document: TextDocument,
  options: Parameters<typeof createCurveRenderer>[2]
) {
  return document.kind === 'curves'
    ? createCurveRenderer(gpu, document, options)
    : createGlyphRenderer(gpu, document, options);
}

/** Prepares a glyph document: instanced glyph quads sampled from a glyph atlas over the page paper. */
export function createGlyphRenderer(
  gpu: GpuDevice,
  document: Extract<TextDocument, { kind: 'glyphs' }>,
  options: RendererOptions
) {
  return createDocumentRenderer(gpu, (gpu, keep) => prepareGlyphDocument(gpu, document, keep), options);
}

/**
 * Prepares a curve document: vector outlines, streamed images, transparency groups and cached page tiles.
 * An initial frame limits image/page prewarming to its visible pages; omitted prewarms the whole document.
 * New pages load on first visit.
 */
export function createCurveRenderer(
  gpu: GpuDevice,
  document: Extract<TextDocument, { kind: 'curves' }>,
  {
    workers,
    initialFrame,
    ...options
  }: RendererOptions & {
    /** Workers owned by the caller; the renderer never destroys them. */
    workers: DocumentWorkers;
    /** Visible frame used to limit prewarming; omitted prewarms the whole document. */
    initialFrame?: SceneFrame;
  }
) {
  return createDocumentRenderer(
    gpu,
    (gpu, keep) => prepareCurveDocument(gpu, document, keep, workers, initialFrame),
    options
  );
}

/** Options shared by every document engine. */
type RendererOptions = {
  /** Aborting cancels preparation, or destroys the renderer once prepared. */
  signal?: AbortSignal;
  /** Canvas for standalone `render`; without it, `render` fails and drawing goes through views. */
  canvas?: GpuContext;
};

/**
 * Runs one engine's preparation as a renderer session using borrowed GPU resources: one preparation per device at a
 * time under a validation error scope, then drawing, settling and disposal. Disposal releases only this document's
 * allocations. settle() waits for the current visible work, not every offscreen resource.
 */
async function createDocumentRenderer(
  gpu: GpuDevice,
  /** Allocates through `keep` and resolves the engine's drawing; `gpu.checkActive` includes this session. */
  prepare: (
    gpu: GpuDevice,
    keep: KeepGpuResource
  ) => ReturnType<typeof prepareCurveDocument | typeof prepareGlyphDocument>,
  { signal, canvas }: RendererOptions
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
            () => prepare({ ...gpu, checkActive }, resources.keep),
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
    const events = preparation.events;
    let standaloneFrame: SceneFrame | undefined;
    let defaultView: ReturnType<typeof createView> | undefined;

    yield* checkActive();

    /** Wraps an engine view so drawing reports lifetime, streaming and TypeGPU failures as results. */
    function createView() {
      const view = preparation.createView();

      return {
        /** Records this view's frame in a scene-owned pass without clearing, ending or submitting it. */
        draw: (pass: GPURenderPassEncoder, frame: SceneFrame) =>
          checkActive().andThen(() => {
            if (preparation.failure) {
              return err(preparation.failure);
            }

            return Result.fromThrowable(
              () => view.draw(pass, frame),
              (cause) => gpuError('render', errorMessage(cause), cause)
            )();
          }),
        /** Stops streaming for this view; the renderer and other views are unaffected. */
        destroy: () => view.destroy()
      };
    }

    const draw = (pass: GPURenderPassEncoder, frame: SceneFrame) => (defaultView ??= createView()).draw(pass, frame);

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

      /** Releases document buffers/textures and ends every view. The providers retain their device and canvas. */
      destroy,

      /** Waits for submitted GPU work and returns any completion or lifetime failure. */
      settle() {
        return safeTry(async function* () {
          yield* checkActive();
          yield* await renderStep(() => preparation.settle());

          if (canvas && standaloneFrame && checkActive().isOk()) {
            yield* renderScene(canvas, [({ pass }) => draw(pass, standaloneFrame!)]);
          }

          yield* await renderStep(() => device.queue.onSubmittedWorkDone());
          yield* checkActive();
          return preparation.failure ? err(preparation.failure) : ok<void>(undefined);
        });
      },

      /** Creates an independent view, such as one canvas of a split screen; destroy it when its canvas closes. */
      createView,

      /** Records the default view's draws in a scene-owned pass, for callers that draw a single view. */
      draw,

      /** Standalone rendering into the `canvas` option for callers outside JSX; the scene helper owns the pass. */
      render(frame: SceneFrame) {
        if (!canvas) {
          return err(gpuError('canvas', 'This renderer has no canvas for standalone rendering'));
        }

        standaloneFrame = frame;
        return renderScene(canvas, [({ pass }) => draw(pass, frame)]);
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

/** Awaits a completion step, reporting a rejection as a typed render error. */
function renderStep(step: () => Promise<void>) {
  return ResultAsync.fromThrowable(step, (cause) => gpuError('render', errorMessage(cause), cause))();
}
