import { UnpackedBMP } from "./unpackBmp";

export type ExtWebGLTexture = WebGLTexture & { width?: number, height?: number }

export function processAtlas(
  gl: WebGLRenderingContext,
  data: UnpackedBMP,
): ExtWebGLTexture {

  const arrayView = new Uint8Array(data.buf);
  const atlasTexture: ExtWebGLTexture = gl.createTexture()!;
  atlasTexture.width = data.width;
  atlasTexture.height = data.height;

  gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  //gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, atlasTexture.width, atlasTexture.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, arrayView);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindTexture(gl.TEXTURE_2D, null);
  console.log("Loaded atlas: " + atlasTexture.width + " x " + atlasTexture.height);

  return atlasTexture;
}
