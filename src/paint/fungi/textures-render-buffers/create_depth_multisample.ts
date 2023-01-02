import { GL_STATIC_VARIABLES } from "@webgl/static-variables";

// Create a MutiSampled Render Buffer
export function create_depth_multisample(
  ctx: WebGL2RenderingContext,
  w: number,
  h: number
): WebGLRenderbuffer {
  const id = ctx.createRenderbuffer()!;

  ctx.bindRenderbuffer(GL_STATIC_VARIABLES.RENDERBUFFER, id);

  //DEPTH_COMPONENT24
  ctx.renderbufferStorageMultisample(
    GL_STATIC_VARIABLES.RENDERBUFFER,
    4,
    GL_STATIC_VARIABLES.DEPTH_COMPONENT16,
    w,
    h
  );

  //Attach buffer to frame
  ctx.framebufferRenderbuffer(
    GL_STATIC_VARIABLES.FRAMEBUFFER,
    GL_STATIC_VARIABLES.DEPTH_ATTACHMENT,
    GL_STATIC_VARIABLES.RENDERBUFFER,
    id
  );

  return id;
}
