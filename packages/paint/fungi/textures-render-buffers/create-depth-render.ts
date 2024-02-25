import { GL_FRAMEBUFFER_OBJECT, GL_STATIC_VARIABLES } from '@packages/webgl/static-variables';

// Create a basic render buffer
export function createDepthRender(ctx: WebGL2RenderingContext, width: number, height: number): WebGLRenderbuffer {
  const id = ctx.createRenderbuffer()!;

  ctx.bindRenderbuffer(GL_STATIC_VARIABLES.RENDERBUFFER, id);
  ctx.renderbufferStorage(GL_FRAMEBUFFER_OBJECT.RENDERBUFFER, GL_STATIC_VARIABLES.DEPTH_COMPONENT16, width, height);

  // Attach buffer to frame
  ctx.framebufferRenderbuffer(
    GL_FRAMEBUFFER_OBJECT.FRAMEBUFFER,
    GL_STATIC_VARIABLES.DEPTH_ATTACHMENT,
    GL_FRAMEBUFFER_OBJECT.RENDERBUFFER,
    id
  );

  return id;
}
