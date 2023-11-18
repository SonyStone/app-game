import {
  GL_FRAMEBUFFER_OBJECT,
  GL_STATIC_VARIABLES,
} from "@webgl/static-variables";

// Create a MutiSampled Render Buffer
export function create_depth_multisample(
  ctx: Pick<
    WebGL2RenderingContext,
    | "createRenderbuffer"
    | "bindRenderbuffer"
    | "renderbufferStorageMultisample"
    | "framebufferRenderbuffer"
  >,
  w: number,
  h: number
): WebGLRenderbuffer {
  const id = ctx.createRenderbuffer()!;

  ctx.bindRenderbuffer(GL_FRAMEBUFFER_OBJECT.RENDERBUFFER, id);

  //DEPTH_COMPONENT24
  ctx.renderbufferStorageMultisample(
    GL_FRAMEBUFFER_OBJECT.RENDERBUFFER,
    4,
    GL_STATIC_VARIABLES.DEPTH_COMPONENT16,
    w,
    h
  );

  //Attach buffer to frame
  ctx.framebufferRenderbuffer(
    GL_FRAMEBUFFER_OBJECT.FRAMEBUFFER,
    GL_STATIC_VARIABLES.DEPTH_ATTACHMENT,
    GL_FRAMEBUFFER_OBJECT.RENDERBUFFER,
    id
  );

  return id;
}
