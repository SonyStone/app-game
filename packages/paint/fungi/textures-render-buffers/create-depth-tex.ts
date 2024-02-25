import { GL_STATIC_VARIABLES } from '@packages/webgl/static-variables';
import {
  GL_TEXTURE_MAG_FILTER,
  GL_TEXTURE_MIN_FILTER,
  GL_TEXTURE_PARAMETER_NAME,
  GL_TEXTURE_TARGET,
  GL_TEXTURE_WRAP_MODE
} from '@packages/webgl/static-variables/textures';

// Create a Depth Texture Buffer
export function createDepthTex(gl: WebGL2RenderingContext, width: number, height: number): WebGLTexture {
  //Up to 16 texture attachments 0 to 15
  const id = gl.createTexture()!;

  gl.bindTexture(GL_TEXTURE_TARGET.TEXTURE_2D, id);
  //ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(
    GL_TEXTURE_TARGET.TEXTURE_2D,
    GL_TEXTURE_PARAMETER_NAME.TEXTURE_MAG_FILTER,
    GL_TEXTURE_MAG_FILTER.NEAREST
  );
  gl.texParameteri(
    GL_TEXTURE_TARGET.TEXTURE_2D,
    GL_TEXTURE_PARAMETER_NAME.TEXTURE_MIN_FILTER,
    GL_TEXTURE_MIN_FILTER.NEAREST
  );
  gl.texParameteri(
    GL_TEXTURE_TARGET.TEXTURE_2D,
    GL_TEXTURE_PARAMETER_NAME.TEXTURE_WRAP_S,
    GL_TEXTURE_WRAP_MODE.CLAMP_TO_EDGE
  );
  gl.texParameteri(
    GL_TEXTURE_TARGET.TEXTURE_2D,
    GL_TEXTURE_PARAMETER_NAME.TEXTURE_WRAP_T,
    GL_TEXTURE_WRAP_MODE.CLAMP_TO_EDGE
  );
  gl.texStorage2D(GL_TEXTURE_TARGET.TEXTURE_2D, 1, GL_STATIC_VARIABLES.DEPTH_COMPONENT16, width, height);

  gl.framebufferTexture2D(
    GL_STATIC_VARIABLES.FRAMEBUFFER,
    GL_STATIC_VARIABLES.DEPTH_ATTACHMENT,
    GL_TEXTURE_TARGET.TEXTURE_2D,
    id,
    0
  );

  return id;
}
