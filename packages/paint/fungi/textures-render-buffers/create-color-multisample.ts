import { COLOR_ATTACHMENT, GL_FRAMEBUFFER_OBJECT, GL_STATIC_VARIABLES } from '@webgl/static-variables';

export function createColorMultisample(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
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
    width,
    height
  );

  // Bind buf to color attachment
  gl.framebufferRenderbuffer(GL_FRAMEBUFFER_OBJECT.FRAMEBUFFER, attach, GL_FRAMEBUFFER_OBJECT.RENDERBUFFER, id);

  return id;
}
