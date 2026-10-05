import { errorMessage, gpuError } from '@app-game/solid-gpu/errors';
import type { GpuContext } from '@app-game/solid-gpu/gpu';
import { err, ok, Result } from 'neverthrow';
import type { ViewerError } from '../../shared/errors';
import type { createSceneUpscaler } from './createSceneUpscaler';
import { gpuFrameTimer } from './gpuFrameTimer';

/**
 * Clears once, draws every layer into one pass, and submits once. A failed layer prevents submission. With `scaled`,
 * layers draw into the top-left part of the upscaler's target at `scale` of the canvas resolution, which is then
 * stretched over the canvas. `moving` tells layers that the frame continues motion and `strained` that such frames
 * stay slow even scaled down. Both passes count in the device's open frame measurement, which this closes; see
 * {@link gpuFrameTimer}.
 */
export function renderScene(
  gpu: GpuContext,
  layers: readonly SceneDraw[],
  scaled?: { upscaler: ReturnType<typeof createSceneUpscaler>; scale: number },
  { moving = false, strained = false }: { moving?: boolean; strained?: boolean } = {}
): Result<void, ViewerError> {
  const active = gpu.checkActive();

  if (active.isErr()) {
    return err(active.error);
  }

  const result = Result.fromThrowable(
    () => {
      const timer = gpuFrameTimer(gpu.device);
      const encoder = gpu.device.createCommandEncoder();
      const canvasView = gpu.context.getCurrentTexture().createView();
      const { width: canvasWidth, height: canvasHeight } = gpu.context.canvas;
      const width = scaled ? Math.max(1, Math.round(canvasWidth * scaled.scale)) : canvasWidth;
      const height = scaled ? Math.max(1, Math.round(canvasHeight * scaled.scale)) : canvasHeight;
      const pass = encoder.beginRenderPass({
        ...timer.pass(),
        colorAttachments: [
          {
            view: scaled ? scaled.upscaler.target(canvasWidth, canvasHeight) : canvasView,
            clearValue: [160 / 255, 169 / 255, 175 / 255, 1],
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      });

      if (scaled) {
        // Layers see a framebuffer of the scaled size: the viewport maps their clip space onto the target's corner.
        pass.setViewport(0, 0, width, height, 0, 1);
        pass.setScissorRect(0, 0, width, height);
      }

      const frame: DrawFrame = { pass, width, height, moving, strained, scale: scaled?.scale ?? 1 };

      for (const draw of layers) {
        const drawn = draw(frame);

        if (drawn?.isErr()) {
          pass.end();
          return err(drawn.error);
        }
      }

      pass.end();

      if (scaled) {
        const upscale = encoder.beginRenderPass({
          ...timer.pass(),
          colorAttachments: [{ view: canvasView, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }]
        });
        scaled.upscaler.blit(upscale, width, height);
        upscale.end();
      }

      timer.finish(encoder);
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
  width: number;
  height: number;
  /** Whether this frame continues motion, such as a gesture; the frame after motion stops is not moving. */
  moving: boolean;
  /** Framebuffer resolution relative to the canvas; below 1 when moving frames proved too slow at full resolution. */
  scale: number;
  /** Whether moving frames stayed too slow even at the smallest scale; layers may then trade exactness for speed. */
  strained: boolean;
};

/** Synchronous draw recording. Expected failures may return Err; external exceptions are captured by renderScene. */
export type SceneDraw = (frame: DrawFrame) => Result<void, ViewerError> | void;
