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

    const { view, rasterSize, glyphPipeline, pagePipeline, imagePipeline, imageGroups, resourceBytes } =
      yield* prepared;

    yield* checkActive();

    const draw = (pass: GPURenderPassEncoder, frame: SceneFrame) =>
      checkActive().andThen(() =>
        Result.fromThrowable(
          () => {
            view.write({
              mul: frame.mul,
              add: frame.add,
              rotation: frame.rotation,
              rasterTexel: [1 / rasterSize[0], 1 / rasterSize[1]],
              debug: Number(frame.grids),
              vectorOnly: Number(frame.vectorOnly)
            });

            pagePipeline.with(pass).draw(document.pages.length * 6);

            for (const item of frame.visible) {
              for (const image of item.page.images) {
                const group = imageGroups.get(image.filename);

                if (group) {
                  imagePipeline.with(pass).with(group).draw(image.numVerts, 1, image.vertexOffset, item.index);
                }
              }
            }

            const glyphs = glyphPipeline.with(pass);

            for (const item of frame.visible) {
              glyphs.draw(item.page.endVertex - item.page.beginVertex, 1, item.page.beginVertex, item.index);
            }
          },
          (cause) => gpuError('render', errorMessage(cause), cause)
        )()
      );

    return ok({
      /** Estimated explicit buffer and texture bytes, excluding driver overhead and swapchain. */
      resourceBytes,

      /** Releases document buffers/textures. The providers retain their device and canvas. */
      destroy,

      /** Waits for submitted GPU work and returns any completion or lifetime failure. */
      settle() {
        return ResultAsync.fromThrowable(
          () => device.queue.onSubmittedWorkDone(),
          (cause) => gpuError('render', errorMessage(cause), cause)
        )().andThen(() => checkActive());
      },

      /** Records document draws in a scene-owned pass without clearing, ending or submitting it. */
      draw,

      /** Standalone rendering for callers outside JSX; the shared scene helper owns the pass. */
      render(frame: SceneFrame) {
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
