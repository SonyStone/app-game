import { GL_FRAMEBUFFER_OBJECT, GL_STATIC_VARIABLES } from '@webgl/static-variables';

// Create a MutiSampled Render Buffer
export function createDepthMultisample(gl: WebGL2RenderingContext, width: number, height: number): WebGLRenderbuffer {
  const id = gl.createRenderbuffer()!;

  gl.bindRenderbuffer(GL_FRAMEBUFFER_OBJECT.RENDERBUFFER, id);

  //DEPTH_COMPONENT24
  gl.renderbufferStorageMultisample(
    GL_FRAMEBUFFER_OBJECT.RENDERBUFFER,
    4,
    GL_STATIC_VARIABLES.DEPTH_COMPONENT16,
    width,
    height
  );

  //Attach buffer to frame
  gl.framebufferRenderbuffer(
    GL_FRAMEBUFFER_OBJECT.FRAMEBUFFER,
    GL_STATIC_VARIABLES.DEPTH_ATTACHMENT,
    GL_FRAMEBUFFER_OBJECT.RENDERBUFFER,
    id
  );

  return id;
}
