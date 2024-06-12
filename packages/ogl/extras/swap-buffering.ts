import { RenderTarget, RenderTargetOptions } from '../core/render-target';
import { OGLRenderingContext } from '../core/renderer';
import { Texture } from '../core/texture';

export interface SwapBuffering {
  read: RenderTarget;
  write: RenderTarget;
  swap(): Texture;
}

/** Ping-Pong Buffering */
export const createSwapBuffering = ({
  gl,
  options
}: {
  gl: OGLRenderingContext;
  options: Partial<RenderTargetOptions>;
}): SwapBuffering => {
  const buffers = {
    read: new RenderTarget(gl, options),
    write: new RenderTarget(gl, options),
    // Helper function to ping pong the render targets and update the uniform
    swap: (): Texture => {
      let temp = buffers.read;
      buffers.read = buffers.write;
      buffers.write = temp;
      return buffers.read.texture;
    }
  };

  return buffers;
};
