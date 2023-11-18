import {
  COLOR_ATTACHMENT,
  GL_FRAMEBUFFER_OBJECT,
  GL_STATIC_VARIABLES,
} from "@webgl/static-variables";

export function create_color_multisample(
  gl: Pick<
    WebGL2RenderingContext,
    | "createRenderbuffer"
    | "bindRenderbuffer"
    | "renderbufferStorageMultisample"
    | "framebufferRenderbuffer"
  >,
  w: number,
  h: number,
  attach: COLOR_ATTACHMENT,
  sample_size = 4
): WebGLRenderbuffer {
  //NOTE, Only sampleSize of 4 works, any other value crashes.
  const id = gl.createRenderbuffer()!;

  // Bind Buffer
  gl.bindRenderbuffer(GL_FRAMEBUFFER_OBJECT.RENDERBUFFER, id);

  // Set Data Size
  gl.renderbufferStorageMultisample(
    GL_FRAMEBUFFER_OBJECT.RENDERBUFFER,
    sample_size,
    GL_STATIC_VARIABLES.RGBA8,
    w,
    h
  );

  // Bind buf to color attachment
  gl.framebufferRenderbuffer(
    GL_FRAMEBUFFER_OBJECT.FRAMEBUFFER,
    attach,
    GL_FRAMEBUFFER_OBJECT.RENDERBUFFER,
    id
  );

  return id;
}
