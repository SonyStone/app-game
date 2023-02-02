import { GL_STATIC_VARIABLES, GL_TEXTURES } from "@webgl/static-variables";

export function createCheckerTexture(gl: WebGL2RenderingContext) {
  const id = gl.createTexture();
  gl.bindTexture(GL_STATIC_VARIABLES.TEXTURE_2D, id);

  gl.texImage2D(
    GL_TEXTURES.TEXTURE_2D,
    0, // mip level
    GL_STATIC_VARIABLES.LUMINANCE, // internal format
    4, // width
    4, // height
    0, // border
    GL_STATIC_VARIABLES.LUMINANCE, // format
    GL_STATIC_VARIABLES.UNSIGNED_BYTE, // type
    new Uint8Array([
      // data
      192, 128, 192, 128, 128, 192, 128, 192, 192, 128, 192, 128, 128, 192, 128,
      192,
    ])
  );
  gl.texParameteri(
    GL_TEXTURES.TEXTURE_2D,
    GL_TEXTURES.TEXTURE_MIN_FILTER,
    GL_TEXTURES.NEAREST
  );
  gl.texParameteri(
    GL_TEXTURES.TEXTURE_2D,
    GL_TEXTURES.TEXTURE_MAG_FILTER,
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
}
