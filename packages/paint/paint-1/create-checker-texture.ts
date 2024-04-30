import { GL_STATIC_VARIABLES } from '@packages/webgl/static-variables';
import {
  GL_TEXTURE_MAG_FILTER,
  GL_TEXTURE_MIN_FILTER,
  GL_TEXTURE_PARAMETER_NAME,
  GL_TEXTURE_TARGET,
  GL_TEXTURE_WRAP_MODE
} from '@packages/webgl/static-variables/textures';

export function createCheckerTexture(gl: WebGL2RenderingContext) {
  const id = gl.createTexture();
  gl.bindTexture(GL_STATIC_VARIABLES.TEXTURE_2D, id);

  gl.texImage2D(
    GL_TEXTURE_TARGET.TEXTURE_2D,
    0, // mip level
    GL_STATIC_VARIABLES.LUMINANCE, // internal format
    4, // width
    4, // height
    0, // border
    GL_STATIC_VARIABLES.LUMINANCE, // format
    GL_STATIC_VARIABLES.UNSIGNED_BYTE, // type
    new Uint8Array([
      // data
      192, 128, 192, 128, 128, 192, 128, 192, 192, 128, 192, 128, 128, 192, 128, 192
    ])
  );
  gl.texParameteri(
    GL_TEXTURE_TARGET.TEXTURE_2D,
    GL_TEXTURE_PARAMETER_NAME.TEXTURE_MIN_FILTER,
    GL_TEXTURE_MIN_FILTER.NEAREST
  );
  gl.texParameteri(
    GL_TEXTURE_TARGET.TEXTURE_2D,
    GL_TEXTURE_PARAMETER_NAME.TEXTURE_MAG_FILTER,
    GL_TEXTURE_MAG_FILTER.NEAREST
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
}
