import { GL_FRAMEBUFFER_TARGET } from '../static-variables';
import {
  GL_COMPARISON_FUNCTION,
  GL_COMPARISON_MODE,
  GL_COMPRESSED_TEXTURE_3D_TARGET,
  GL_FRAMEBUFFER_ATTACHMENT,
  GL_INTERNAL_FORMAT,
  GL_PIXEL_FORMAT,
  GL_TEXTURES,
  GL_TEXTURE_2D_TARGET,
  GL_TEXTURE_MAG_FILTER,
  GL_TEXTURE_MIN_FILTER,
  GL_TEXTURE_PARAMETER_NAME,
  GL_TEXTURE_TARGET,
  GL_TEXTURE_UNIT,
  GL_TEXTURE_WRAP_MODE
} from '../static-variables/textures';

export interface WebGLRenderingContextTexture {
  /**
   * specifies which texture unit to make active.
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/activeTexture)
   */
  activeTexture(texture: GL_TEXTURE_UNIT): void;

  /**
   * binds a given WebGLTexture to a target (binding point)
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindTexture)
   */
  bindTexture(target: GL_TEXTURE_TARGET, texture: WebGLTexture): void;

  /**
   * specify a two-dimensional texture image in a compressed format
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/compressedTexImage2D)
   */
  compressedTexImage2D(
    target: GL_TEXTURE_2D_TARGET,
    level: GLint,
    internalformat: GLenum,
    width: GLsizei,
    height: GLsizei,
    border: GLint,
    data: ArrayBufferView
  ): void;
  compressedTexImage2D(
    target: GL_TEXTURE_2D_TARGET,
    level: GLint,
    internalformat: GLenum,
    width: GLsizei,
    height: GLsizei,
    border: GLint,
    imageSize: GLsizei,
    offset: GLintptr
  ): void;
  compressedTexImage2D(
    target: GL_TEXTURE_2D_TARGET,
    level: GLint,
    internalformat: GLenum,
    width: GLsizei,
    height: GLsizei,
    border: GLint,
    srcData: ArrayBufferView,
    srcOffset?: GLuint,
    srcLengthOverride?: GLuint
  ): void;

  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/compressedTexSubImage2D) */
  compressedTexSubImage2D(
    target: GLenum,
    level: GLint,
    xoffset: GLint,
    yoffset: GLint,
    width: GLsizei,
    height: GLsizei,
    format: GLenum,
    imageSize: GLsizei,
    offset: GLintptr
  ): void;
  compressedTexSubImage2D(
    target: GLenum,
    level: GLint,
    xoffset: GLint,
    yoffset: GLint,
    width: GLsizei,
    height: GLsizei,
    format: GLenum,
    srcData: ArrayBufferView,
    srcOffset?: GLuint,
    srcLengthOverride?: GLuint
  ): void;

  /**
   * copies pixels from the current `WebGLFramebuffer` into a 2D texture image
   * ```ts
   * gl.copyTexImage2D(GL_TEXTURE_2D_TARGET.TEXTURE_2D, 0, GL_PIXEL_FORMAT.RGBA, 0, 0, 512, 512, 0);
   * ```
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/copyTexImage2D)
   */
  copyTexImage2D(
    target: GL_TEXTURE_2D_TARGET,
    level: GLint,
    internalformat: GL_PIXEL_FORMAT,
    x: GLint,
    y: GLint,
    width: GLsizei,
    height: GLsizei,
    border: GLint
  ): void;

  /**
   * copies pixels from the current `WebGLFramebuffer` into an existing 2D texture sub-image
   *
   * ```ts
   * gl.copyTexSubImage2D(GL_TEXTURE_2D_TARGET.TEXTURE_2D, 0, 0, 0, 0, 0, 16, 16);
   * ```
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/copyTexSubImage2D)
   */
  copyTexSubImage2D(
    target: GL_TEXTURE_2D_TARGET,
    level: GLint,
    xoffset: GLint,
    yoffset: GLint,
    x: GLint,
    y: GLint,
    width: GLsizei,
    height: GLsizei
  ): void;

  /**
   * creates and initializes a `WebGLTexture` object.
   *
   * ```ts
   * const canvas = document.getElementById("canvas");
   * const gl = canvas.getContext("webgl");
   * const texture = gl.createTexture();
   * ```
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/createTexture)
   */
  createTexture(): WebGLTexture | null;

  /**
   * deletes a given WebGLTexture object. This method has no effect if the texture has already been deleted.
   *
   * ```ts
   * const canvas = document.getElementById("canvas");
   * const gl = canvas.getContext("webgl");
   * const texture = gl.createTexture();
   *
   * // …
   *
   * gl.deleteTexture(texture);
   * ```
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteTexture)
   * */
  deleteTexture(texture: WebGLTexture | null): void;

  /**
   * attaches a texture to a `WebGLFramebuffer`.
   *
   *
   * @errors
   * * `gl.INVALID_ENUM`
   * * * `target` is not `gl.FRAMEBUFFER`.
   * * * `attachment` is not one of the accepted attachment points.
   * * * `textarget` is not one of the accepted texture targets.
   * * `gl.INVALID_VALUE` error is thrown if level is not 0.
   * * `gl.INVALID_OPERATION` error is thrown if texture isn't 0 or the name of an existing texture object.
   *
   * @example
   * ```ts
   * gl.framebufferTexture2D(
   *  GL_FRAMEBUFFER_TARGET.FRAMEBUFFER,
   *  gl.COLOR_ATTACHMENT0,
   *  GL_TEXTURE_2D_TARGET.TEXTURE_2D,
   *  texture,
   *  0,
   * );
   * ```
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/framebufferTexture2D)
   */
  // ??? part of WebGLFramebuffer or Textures?
  framebufferTexture2D(
    target: GL_FRAMEBUFFER_TARGET,
    attachment: GL_FRAMEBUFFER_ATTACHMENT,
    textarget: GL_TEXTURE_2D_TARGET,
    texture: WebGLTexture | null,
    level: GLint
  ): void;

  /**
   * generates a set of mipmaps for a WebGLTexture object.
   *
   * @example
   * ```ts
   * gl.generateMipmap(gl.TEXTURE_2D);
   * ```
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/generateMipmap)
   */
  generateMipmap(target: GL_TEXTURE_TARGET): void;

  /**
   * returns information about the given texture.
   *
   * @example
   * ```ts
   * gl.getTexParameter(GL_TEXTURE_TARGET.TEXTURE_2D, GL_TEXTURE_PARAMETER_NAME.TEXTURE_MAG_FILTER);
   * ```
   *
   * @errors
   * If an error occurs, `null` is returned.
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/getTexParameter)
   */
  // ??? Not very useful
  // ??? We already should know all the information about the texture.
  getTexParameter(target: GL_TEXTURE_TARGET, pname: GLenum): any;
  getTexParameter(
    target: GL_TEXTURE_TARGET,
    pname: GL_TEXTURE_PARAMETER_NAME.TEXTURE_MAG_FILTER
  ): GL_TEXTURE_MAG_FILTER;
  getTexParameter(
    target: GL_TEXTURE_TARGET,
    pname: GL_TEXTURE_PARAMETER_NAME.TEXTURE_MIN_FILTER
  ): GL_TEXTURE_MIN_FILTER;
  getTexParameter(target: GL_TEXTURE_TARGET, pname: GL_TEXTURE_PARAMETER_NAME.TEXTURE_WRAP_S): GL_TEXTURE_WRAP_MODE;
  getTexParameter(target: GL_TEXTURE_TARGET, pname: GL_TEXTURE_PARAMETER_NAME.TEXTURE_WRAP_T): GL_TEXTURE_WRAP_MODE;
  getTexParameter(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_BASE_LEVEL): GLint;
  getTexParameter(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_COMPARE_FUNC): GL_COMPARISON_FUNCTION;
  getTexParameter(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_COMPARE_MODE): GL_COMPARISON_MODE;
  getTexParameter(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_IMMUTABLE_FORMAT): GLboolean;
  getTexParameter(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_IMMUTABLE_LEVELS): GLuint;
  getTexParameter(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_MAX_LEVEL): GLint;
  getTexParameter(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_MAX_LOD): GLfloat;
  getTexParameter(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_MIN_LOD): GLfloat;
  getTexParameter(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_WRAP_R): GL_TEXTURE_WRAP_MODE;

  /**
   * returns `true` if the passed `WebGLTexture` is valid and `false` otherwise.
   *
   * @example
   * ```ts
   * let texture = gl.createTexture();
   * // ... some code that might delete textures ...
   * if (gl.isTexture(texture)) {
   *     // The texture is still valid, so it's safe to use it
   *     gl.bindTexture(gl.TEXTURE_2D, texture);
   * } else {
   *     // The texture is not valid, so we should not use it
   *     console.error('Attempted to use an invalid texture');
   * }
   * ```
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/isTexture)
   */
  isTexture(texture: WebGLTexture | null): GLboolean;

  /**
   * specifies the pixel storage modes.
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/pixelStorei)
   */
  // TODO: add more information about the parameters
  pixelStorei(pname: GLenum, param: GLint | GLboolean): void;

  /**
   * specifies a two-dimensional texture image.
   *
   * ```ts
   * gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
   * ```
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/texImage2D)
   * */
  // TODO: add more overloads information
  texImage2D(
    target: GL_TEXTURE_2D_TARGET,
    level: GLint,
    internalformat: GL_INTERNAL_FORMAT,
    width: GLsizei,
    height: GLsizei,
    border: GLint,
    format: GLenum,
    type: GLenum,
    pixels: ArrayBufferView | null
  ): void;
  texImage2D(
    target: GL_TEXTURE_2D_TARGET,
    level: GLint,
    internalformat: GL_INTERNAL_FORMAT,
    format: GLenum,
    type: GLenum,
    source: TexImageSource
  ): void;

  /**
   * set texture parameters.
   *
   * ```ts
   * gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
   * ```
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/texParameter)
   */
  texParameterf(target: GL_TEXTURE_TARGET, pname: GLenum, param: GLfloat): void;
  texParameterf(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_MAX_LOD, param: GLfloat): void;
  texParameterf(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_MIN_LOD, param: GLfloat): void;
  /**
   * set texture parameters.
   *
   * ```ts
   * gl.texParameteri(
   *   gl.TEXTURE_2D,
   *   gl.TEXTURE_MIN_FILTER,
   *   gl.LINEAR_MIPMAP_NEAREST,
   * );
   * ```
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/texParameter)
   */
  texParameteri(
    target: GL_TEXTURE_TARGET,
    pname: GL_TEXTURE_PARAMETER_NAME.TEXTURE_MAG_FILTER,
    param: GL_TEXTURE_MAG_FILTER
  ): void;
  texParameteri(
    target: GL_TEXTURE_TARGET,
    pname: GL_TEXTURE_PARAMETER_NAME.TEXTURE_MIN_FILTER,
    param: GL_TEXTURE_MIN_FILTER
  ): void;
  texParameteri(
    target: GL_TEXTURE_TARGET,
    pname: GL_TEXTURE_PARAMETER_NAME.TEXTURE_WRAP_S,
    param: GL_TEXTURE_WRAP_MODE
  ): void;
  texParameteri(
    target: GL_TEXTURE_TARGET,
    pname: GL_TEXTURE_PARAMETER_NAME.TEXTURE_WRAP_T,
    param: GL_TEXTURE_WRAP_MODE
  ): void;
  texParameteri(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_BASE_LEVEL, param: GLint): void;
  texParameteri(
    target: GL_TEXTURE_TARGET,
    pname: GL_TEXTURES.TEXTURE_COMPARE_FUNC,
    param: GL_COMPARISON_FUNCTION
  ): void;
  texParameteri(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_COMPARE_MODE, param: GL_COMPARISON_MODE): void;
  texParameteri(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_MAX_LEVEL, param: GLint): void;
  texParameteri(target: GL_TEXTURE_TARGET, pname: GL_TEXTURES.TEXTURE_WRAP_R, param: GL_TEXTURE_WRAP_MODE): void;
}

export interface WebGLRenderingContextTexture3D {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGL2RenderingContext/compressedTexImage3D) */
  compressedTexImage3D(
    target: GL_COMPRESSED_TEXTURE_3D_TARGET,
    level: GLint,
    internalformat: GLenum,
    width: GLsizei,
    height: GLsizei,
    depth: GLsizei,
    border: GLint,
    imageSize: GLsizei,
    offset: GLintptr
  ): void;
  compressedTexImage3D(
    target: GL_COMPRESSED_TEXTURE_3D_TARGET,
    level: GLint,
    internalformat: GLenum,
    width: GLsizei,
    height: GLsizei,
    depth: GLsizei,
    border: GLint,
    srcData: ArrayBufferView,
    srcOffset?: GLuint,
    srcLengthOverride?: GLuint
  ): void;
}

export interface WebGLRenderingContextShader {
  // attachShader();
}
