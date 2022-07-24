import { GL_STATIC_VARIABLES, GL_TEXTURES } from '@webgl/static-variables';

import { forceAnimationChange } from './renderNextFrame';

const imageTextures: any = {};

export function getImageTexture(gl: WebGLRenderingContext, filename: string) {
  let handle = imageTextures[filename];
  if (!handle) {
    handle = gl.createTexture();
    var img = new Image();
    img.src = 'images/' + filename;
    img.onload = function () {
      imageTextureReady(gl, handle, img);
    };
    imageTextures[filename] = handle;
    return null;
  }

  if (!handle.ready) {
    return null;
  }

  return handle;
}

function imageTextureReady(
  gl: WebGLRenderingContext,
  handle: WebGLTexture,
  image: HTMLImageElement
) {
  gl.bindTexture(GL_TEXTURES.TEXTURE_2D, handle);
  gl.pixelStorei(GL_STATIC_VARIABLES.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(GL_STATIC_VARIABLES.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); // TODO: should be true for proper mipmap
  //gl.pixelStorei(GL_STATIC_VARIABLES.UNPACK_COLORSPACE_CONVERSION_WEBGL, GL_STATIC_VARIABLES.NONE);
  gl.texImage2D(
    GL_TEXTURES.TEXTURE_2D,
    0,
    GL_STATIC_VARIABLES.RGBA,
    GL_STATIC_VARIABLES.RGBA,
    GL_STATIC_VARIABLES.UNSIGNED_BYTE,
    resizeImageToPowerOfTwo(image)
  );
  gl.hint(
    GL_STATIC_VARIABLES.GENERATE_MIPMAP_HINT,
    GL_STATIC_VARIABLES.FASTEST
  );
  gl.generateMipmap(GL_TEXTURES.TEXTURE_2D);
  gl.texParameteri(
    GL_TEXTURES.TEXTURE_2D,
    GL_TEXTURES.TEXTURE_MAG_FILTER,
    GL_TEXTURES.LINEAR
  );
  gl.texParameteri(
    GL_TEXTURES.TEXTURE_2D,
    GL_TEXTURES.TEXTURE_MIN_FILTER,
    GL_TEXTURES.LINEAR_MIPMAP_LINEAR
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
  gl.bindTexture(GL_TEXTURES.TEXTURE_2D, null);
  (handle as any).ready = true;
  forceAnimationChange();
}

function resizeImageToPowerOfTwo(image: HTMLImageElement) {
  var width = roundUpToPowerOfTwo(image.width);
  var height = roundUpToPowerOfTwo(image.height);

  if (width == image.width && height == image.height) {
    return image;
  }

  var cv = document.createElement('canvas') as HTMLCanvasElement;
  var ctx = cv.getContext('2d')!;
  cv.width = width;
  cv.height = height;
  ctx.drawImage(image, 0, 0, width, height);
  return cv;
}

function roundUpToPowerOfTwo(x: number) {
  //return Math.pow(2, Math.floor(Math.log(x, 2)) + 1);
  x--;
  for (var i = 1; i < 32; i *= 2) {
    x |= x >> i;
  }
  return ++x;
}
