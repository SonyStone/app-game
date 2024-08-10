import { RenderTarget, RenderTargetOptions } from '../core/render-target';
import { OGLRenderingContext } from '../core/renderer';
import { Texture } from '../core/texture';

/** Ping-Pong Buffering */
export class SwapBuffering {
  read: RenderTarget;
  write: RenderTarget;

  constructor(
    readonly gl: OGLRenderingContext,
    readonly options: Partial<RenderTargetOptions>
  ) {
    this.read = new RenderTarget(gl, { ...this.options, id: '🖼️read' });
    this.write = new RenderTarget(gl, { ...this.options, id: '🖼️write' });
  }

  swap(): Texture {
    // console.groupCollapsed('⇄ swap buffers');
    // console.trace();
    // console.groupEnd();
    let temp = this.read;
    this.read = this.write;
    this.write = temp;
    return this.read.texture;
  }
}
