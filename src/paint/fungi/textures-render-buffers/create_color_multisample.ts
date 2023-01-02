import { COLOR_ATTACHMENT, GL_STATIC_VARIABLES } from "@webgl/static-variables";

export function create_color_multisample(
  ctx: WebGL2RenderingContext,
  w: number,
  h: number,
  attach: COLOR_ATTACHMENT,
  sample_size = 4
): WebGLRenderbuffer {
  //NOTE, Only sampleSize of 4 works, any other value crashes.
  const id = ctx.createRenderbuffer()!;

  // Bind Buffer
  ctx.bindRenderbuffer(GL_STATIC_VARIABLES.RENDERBUFFER, id);

  // Set Data Size
  ctx.renderbufferStorageMultisample(
    GL_STATIC_VARIABLES.RENDERBUFFER,
    sample_size,
    GL_STATIC_VARIABLES.RGBA8,
    w,
    h
  );

  // Bind buf to color attachment
  ctx.framebufferRenderbuffer(
    GL_STATIC_VARIABLES.FRAMEBUFFER,
    attach,
    GL_STATIC_VARIABLES.RENDERBUFFER,
    id
  );

  return id;
}
