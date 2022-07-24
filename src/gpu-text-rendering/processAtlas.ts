import { GL_STATIC_VARIABLES, GL_TEXTURES } from '@webgl/static-variables';

import { UnpackedBMP } from './unpackBmp';

export type ExtWebGLTexture = WebGLTexture & {
  width?: number;
  height?: number;
};

export function processAtlas(
  gl: WebGLRenderingContext,
  data: UnpackedBMP
): ExtWebGLTexture {
  const arrayView = new Uint8Array(data.buf);
  const atlasTexture: ExtWebGLTexture = gl.createTexture()!;
  atlasTexture.width = data.width;
  atlasTexture.height = data.height;

  gl.bindTexture(GL_TEXTURES.TEXTURE_2D, atlasTexture);
  gl.pixelStorei(GL_STATIC_VARIABLES.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(GL_STATIC_VARIABLES.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  //gl.pixelStorei(GL_STATIC_VARIABLES.UNPACK_COLORSPACE_CONVERSION_WEBGL, GL_STATIC_VARIABLES.NONE);
  gl.texImage2D(
    GL_TEXTURES.TEXTURE_2D,
    0,
    GL_STATIC_VARIABLES.RGBA,
    atlasTexture.width,
    atlasTexture.height,
    0,
    GL_STATIC_VARIABLES.RGBA,
    GL_STATIC_VARIABLES.UNSIGNED_BYTE,
    arrayView
  );
  gl.texParameteri(
    GL_TEXTURES.TEXTURE_2D,
    GL_TEXTURES.TEXTURE_MAG_FILTER,
    GL_TEXTURES.NEAREST
  );
  gl.texParameteri(
    GL_TEXTURES.TEXTURE_2D,
    GL_TEXTURES.TEXTURE_MIN_FILTER,
    GL_TEXTURES.NEAREST
  );
  gl.texParameteri(
    GL_TEXTURES.TEXTURE_2D,
    GL_TEXTURES.TEXTURE_WRAP_S,
    GL_TEXTURES.CLAMP_TO_EDGE
  );
  gl.texParameteri(
    GL_TEXTURES.TEXTURE_2D,
    GL_TEXTURES.TEXTURE_WRAP_T,
    GL_TEXTURES.CLAMP_TO_EDGE
  );

  gl.bindTexture(gl.TEXTURE_2D, null);
  console.log(
    'Loaded atlas: ' + atlasTexture.width + ' x ' + atlasTexture.height
  );

  return atlasTexture;
}
