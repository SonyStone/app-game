import { forceAnimationChange } from "./renderNextFrame";

const imageTextures: any = {};

export function getImageTexture(gl: WebGLRenderingContext, filename: string) {
  let handle = imageTextures[filename];
  if (!handle) {
    handle = gl.createTexture();
    var img = new Image();
    img.src = "images/" + filename;
    img.onload = function() { imageTextureReady(gl, handle, img) }
    imageTextures[filename] = handle;
    return null;
  }

  if (!handle.ready) {
    return null;
  }

  return handle;
}

function imageTextureReady(gl: WebGLRenderingContext, handle: WebGLTexture , image: HTMLImageElement) {
  gl.bindTexture(gl.TEXTURE_2D, handle);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); // TODO: should be true for proper mipmap
  //gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, resizeImageToPowerOfTwo(image));
  gl.hint(gl.GENERATE_MIPMAP_HINT, gl.FASTEST);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  (handle as any).ready = true;
  forceAnimationChange();
}

function resizeImageToPowerOfTwo(image: HTMLImageElement) {
  var width = roundUpToPowerOfTwo(image.width);
  var height = roundUpToPowerOfTwo(image.height);

  if (width == image.width && height == image.height) {
    return image;
  }

  var cv = document.createElement("canvas") as HTMLCanvasElement;
  var ctx = cv.getContext("2d")!;
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

