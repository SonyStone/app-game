import {
  GL_FRAMEBUFFER_OBJECT,
  GL_STATIC_VARIABLES,
} from "@webgl/static-variables";

// Create a basic render buffer
export function create_depth_render(
  ctx: Pick<
    WebGL2RenderingContext,
    | "createRenderbuffer"
    | "bindRenderbuffer"
    | "renderbufferStorage"
    | "framebufferRenderbuffer"
  >,
  w: number,
  h: number
): WebGLRenderbuffer {
  const id = ctx.createRenderbuffer()!;

  ctx.bindRenderbuffer(GL_STATIC_VARIABLES.RENDERBUFFER, id);
  ctx.renderbufferStorage(
    GL_FRAMEBUFFER_OBJECT.RENDERBUFFER,
    GL_STATIC_VARIABLES.DEPTH_COMPONENT16,
    w,
    h
  );

  // Attach buffer to frame
  ctx.framebufferRenderbuffer(
    GL_FRAMEBUFFER_OBJECT.FRAMEBUFFER,
    GL_STATIC_VARIABLES.DEPTH_ATTACHMENT,
    GL_FRAMEBUFFER_OBJECT.RENDERBUFFER,
    id
  );

  return id;
}
