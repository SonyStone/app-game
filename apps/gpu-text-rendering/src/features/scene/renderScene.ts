import { err, ok, Result } from 'neverthrow';
import { errorMessage, gpuError, type ViewerError } from '../../shared/errors';
import type { GpuContext } from '../../shared/gpu/context';

/** Clears once, draws every layer into one pass, and submits once. A failed layer prevents submission. */
export function renderScene(gpu: GpuContext, layers: readonly SceneDraw[], timestamp = 0): Result<void, ViewerError> {
  const active = gpu.checkActive();

  if (active.isErr()) {
    return err(active.error);
  }

  const result = Result.fromThrowable(
    () => {
      const encoder = gpu.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: gpu.context.getCurrentTexture().createView(),
            clearValue: [160 / 255, 169 / 255, 175 / 255, 1],
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      });

      const frame: DrawFrame = {
        pass,
        timestamp,
        width: gpu.context.canvas.width,
        height: gpu.context.canvas.height
      };

      for (const draw of layers) {
        const drawn = draw(frame);

        if (drawn?.isErr()) {
          pass.end();
          return err(drawn.error);
        }
      }

      pass.end();
      gpu.device.queue.submit([encoder.finish()]);

      return ok();
    },
    (cause) => gpuError('render', errorMessage(cause), cause)
  )();

  return result.isErr() ? err(result.error) : result.value;
}

/** Shared pass and framebuffer dimensions. Layers may record draws but must not end or submit this pass. */
export type DrawFrame = {
  pass: GPURenderPassEncoder;
  timestamp: number;
  width: number;
  height: number;
};

/** Synchronous draw recording. Expected failures may return Err; external exceptions are captured by renderScene. */
export type SceneDraw = (frame: DrawFrame) => Result<void, ViewerError> | void;
