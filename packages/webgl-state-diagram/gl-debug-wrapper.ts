import { GL_SHADER_TYPE, GL_STATIC_VARIABLES } from '@packages/webgl/static-variables';
import {
  GL_TEXTURE_MAG_FILTER,
  GL_TEXTURE_MIN_FILTER,
  GL_TEXTURE_WRAP_MODE
} from '@packages/webgl/static-variables/textures';

/**
 * A vertex shader's sole responsibility is to set `gl_Position` to a clip space position. To create one use:
 *
 * ```typescript
 * const shader = gl.createShader(gl.VERTEX_SHADER);
 * gl.shaderSource(shader, glslString);
 * gl.compileShader(shader);
 * if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) === 0) {
 *   console.error(gl.getShaderInfoLog(shader));
 * }
 * ```
 */
interface WebGLShaderState {
  source: string | undefined;
  state: { COMPILE_STATUSE: boolean };
}

/**
 * A program is a combination of a vertex shader and a fragment shader _linked_ together.
 *
 * ```typescript
 * const program = gl.createProgram();
 * gl.attachShader(program, someVertexShader);
 * gl.attachShader(program, someFragmentShader);
 * gl.linkProgram(program);
 * if (gl.getProgramParameter(program, gl.LINK_STATUS) === 0) {
 *   console.error(gl.getProgramInfoLog(program));
 * }
 * ```
 */
class WebGLProgramState {
  attached_shaders: Map<WebGLShader, WebGLShaderState> = new Map();
  attribute_info: WebGLAttributeState[] = [];
  uniforms: WebGLUniformState[] = [];
  uniforms_by_name: { [key: string]: WebGLUniformState } = {};
  uniforms_by_location: Map<WebGLUniformLocation, WebGLUniformState> = new Map();
  state: {
    LINK_STATUS: boolean;
  } = { LINK_STATUS: false };

  toString() {
    return 'prg';
  }
}

interface WebGLUniformState {
  name: string;
  value: any;
  type: number;
  size: number;
  location: WebGLUniformLocation | null;
}

interface WebGLAttributeState {
  name: string;
  type: any;
  location: number;
}

interface WebGLFramebufferState {}

interface WebGLRenderbufferState {}

/**
 * Textures provide random access data to shaders. Most often they
 * contain image data but not always.
 *
 * Textures are created with
 *
 * ```typescritp
 * const tex = gl.createTexture();
 * ```
 *
 * and bound to a texture unit bind point (target) with
 *
 * ```typescript
 * gl.activeTexture(gl.TEXTURE0 + texUnitIndex);
 * const bindPoint = gl.TEXTURE_2D;
 * gl.bindTexture(bindPoint, tex);
 * ```
 *
 * All texture functions reference textures through the bind points
 * on the active texture unit. ie.
 *
 * ```typescript
 * texture = textureUnits[activeTexture][bindPoint]
 * ```
 *
 * For more details see [the article on textures](https://webglfundamentals.org/webgl/lessons/webgl-3d-textures.html).
 */
interface WebGLTextureState {
  mips: {};
  texturestate: {
    TEXTURE_MIN_FILTER: GL_TEXTURE_MIN_FILTER;
    TEXTURE_MAG_FILTER: GL_TEXTURE_MAG_FILTER;
    TEXTURE_WRAP_S: GL_TEXTURE_WRAP_MODE;
    TEXTURE_WRAP_T: GL_TEXTURE_WRAP_MODE;
  };
}

/**
 * Buffers contain data provided to attributes.
 *
 * Buffers are created with
 *
 * ```typescript
 * const buffer = gl.createBuffer();
 * ```
 */
interface WebGLBufferState {
  data: any;
}

/**
 * Vertex Arrays contain all attribute state. Attributes define
 * how to pull data out of buffers to supply to a vertex shader.
 *
 * Normally there is only the 1 default vertex array in WebGL 1.0.
 *
 * You can create more vertex arrays with the `OES_vertex_array_object` extension.
 *
 * ```typescript
 * const ext = gl.getExtension('OES_vertex_array_object')
 * const vertexArray = ext.createVertexArrayOES();
 * ```
 *
 * and bind one (make it the current vertex array) with
 *
 * ```typescript
 * ext.bindVertexArrayOES(someVertexArray);
 * ```
 *
 * Passing `null` to ext.bindVertexArrayOES binds the default vertex array.
 */
interface WebGLVertexArrayObjectState {
  attributes: any[];
  state: {
    ELEMENT_ARRAY_BUFFER_BINDING: WebGLBufferState | null;
  };
}

/**
 * State
 *
 * Binded WebGL data
 */
interface CommonState {
  /** `0, 0, 300, 150` */
  VIEWPORT: number[];
  ARRAY_BUFFER_BINDING: WebGLBufferState | null;
  CURRENT_PROGRAM: WebGLProgramState | null;
  /** `null` (default VAO) */
  VERTEX_ARRAY_BINDING: WebGLVertexArrayObjectState | null;
  RENDERBUFFER_BINDING: WebGLRenderbufferState | null;
  /** `null` (canvas) */
  FRAMEBUFFER_BINDING: WebGLFramebufferState | null;
  /** `TEXTURE0` */
  ACTIVE_TEXTURE: string;
}

/**
 * Each texture unit has multiple bind points. You can bind a texture to each point
 * but it is an error for a program to try to access 2 or more different bind points
 * from the same texture unit.
 *
 * For example you have a shader with both a 2D sampler and a cube sampler.
 *
 * ```typescript
 * uniform sampler2D foo;
 * uniform samplerCube bar;
 * ```
 *
 * Even though there are are both `TEXTURE_2D` and `TEXTURE_CUBE_MAP` bind points in
 * a single texture unit if you set both bar and foo to the same unit you'll get an
 * error
 *
 * ```typescript
 * const unit = 3;
 * gl.uniform1i(fooLocation, unit);
 * gl.uniform1i(barLocation, unit);
 * ```
 *
 * The code above will generate an error at draw time because `foo` and `bar`
 * require different sampler types. If they are the same type it is okay to point
 * both to the same texture unit.
 *
 * > Note: Only 8 texture units are shown here for space reasons but
 * > the actual number of bind points you can look up with
 * > `gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)` which will be
 * > a minimum of 8.
 */
interface TextureUnits {}

interface WebGLState {
  globalState: {
    commonState: CommonState;
    textureUtils: TextureUnits;
  };

  /**
   * Shaders in use
   * ```typescript
   * gl.createShader(type)
   * gl.compileShader()
   * gl.attachShader()
   * gl.deleteShader()
   * ```
   */
  shaders: Map<WebGLShader, WebGLShaderState>;

  /**
   * Programs in use
   *
   * ```typescript
   * gl.createProgram(): WebGLProgram | null
   * gl.linkProgram(program: WebGLProgram): void
   * gl.useProgram(program: WebGLProgram | null): void
   * ```
   */
  programs: Map<WebGLProgram, WebGLProgramState>;

  /**
   * Buffers in use
   *
   * ```typescript
   * gl.createBuffer(): WebGLBuffer | null
   * gl.bindBuffer(target: number, buffer: WebGLBuffer | null): void
   * ```
   */
  buffers: Map<WebGLBuffer, WebGLBufferState>;

  /**
   * VertexArrayObjects in use
   *
   * ```typescript
   * gl.createVertexArray(): WebGLVertexArrayObject | null
   * gl.bindVertexArray(array: WebGLVertexArrayObject | null): void
   * ```
   */
  vertexArrayObjects: Map<WebGLVertexArrayObject, WebGLVertexArrayObjectState>;

  /**
   * RenderBuffers in use
   *
   * ```typescript
   * gl.createRenderbuffer(): WebGLRenderbuffer | null
   * gl.bindRenderbuffer(target: GLenum, renderbuffer: WebGLRenderbuffer | null): void
   * ```
   */
  renderBuffers: Map<WebGLRenderbuffer, WebGLRenderbufferState>;

  /**
   * Framebuffer in use
   *
   * ```typescript
   * gl.createFramebuffer(): WebGLFramebuffer | null
   * gl.bindFramebuffer(target: GLenum, framebuffer: WebGLFramebuffer | null): void
   * ```
   */
  framebuffer: Map<WebGLFramebuffer, WebGLFramebufferState>;

  /**
   * Textures in use
   *
   * ```typescript
   * gl.createTexture(): WebGLTexture | null
   * gl.bindTexture(target: GLenum, texture: WebGLTexture | null): void
   * ```
   */
  textures: Map<WebGLTexture, WebGLTextureState>;
}

export class WebGL2DebugWrapper implements WebGL2RenderingContext {
  private defaultVertexArrayObject: WebGLVertexArrayObjectState = {
    attributes: [],
    state: {
      ELEMENT_ARRAY_BUFFER_BINDING: null
    }
  };

  state: WebGLState = {
    globalState: {
      commonState: {
        VIEWPORT: [0, 0, 300, 150],
        ARRAY_BUFFER_BINDING: null,
        CURRENT_PROGRAM: null,
        VERTEX_ARRAY_BINDING: this.defaultVertexArrayObject,
        RENDERBUFFER_BINDING: null,
        FRAMEBUFFER_BINDING: null,
        ACTIVE_TEXTURE: 'TEXTURE0'
      },
      textureUtils: {}
    },
    shaders: new Map<WebGLShader, WebGLShaderState>(),
    programs: new Map<WebGLProgram, WebGLProgramState>(),
    buffers: new Map<WebGLBuffer, WebGLBufferState>(),
    vertexArrayObjects: new Map<WebGLVertexArrayObject, WebGLVertexArrayObjectState>(),
    renderBuffers: new Map<WebGLRenderbuffer, WebGLRenderbufferState>(),
    framebuffer: new Map<WebGLFramebuffer, WebGLFramebufferState>(),
    textures: new Map<WebGLTexture, WebGLTextureState>()
  };

  constructor(private readonly gl: WebGL2RenderingContext) {}
  HALF_FLOAT_OES = this.gl.HALF_FLOAT_OES;
  RGBA16F = this.gl.RGBA16F;
  RGBA32F = this.gl.RGBA32F;
  DEPTH24_STENCIL8 = this.gl.DEPTH24_STENCIL8;
  COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR = this.gl.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR;
  COMPRESSED_SRGB_S3TC_DXT1_EXT = this.gl.COMPRESSED_SRGB_S3TC_DXT1_EXT;
  COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT = this.gl.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;
  COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT = this.gl.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT;
  COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT = this.gl.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT;
  COMPRESSED_SRGB8_ETC2 = this.gl.COMPRESSED_SRGB8_ETC2;
  COMPRESSED_SRGB8_ALPHA8_ETC2_EAC = this.gl.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC;
  DRAW_FRAMEBUFFER = this.gl.DRAW_FRAMEBUFFER;
  UNSIGNED_INT_24_8 = this.gl.UNSIGNED_INT_24_8;
  MAX = this.gl.MAX;
  MIN = this.gl.MIN;
  SRGB = this.gl.SRGB;
  SRGB8 = this.gl.SRGB8;
  SRGB8_ALPHA8 = this.gl.SRGB8_ALPHA8;
  beginQuery(target: number, query: WebGLQuery): void {
    this.gl.beginQuery(target, query);
  }
  beginTransformFeedback(primitiveMode: number): void {
    throw new Error('Method not implemented.');
  }
  bindBufferBase(target: number, index: number, buffer: WebGLBuffer | null): void {
    throw new Error('Method not implemented.');
  }
  bindBufferRange(target: number, index: number, buffer: WebGLBuffer | null, offset: number, size: number): void {
    throw new Error('Method not implemented.');
  }
  bindSampler(unit: number, sampler: WebGLSampler | null): void {
    throw new Error('Method not implemented.');
  }
  bindTransformFeedback(target: number, tf: WebGLTransformFeedback | null): void {
    throw new Error('Method not implemented.');
  }
  clearBufferfi(buffer: number, drawbuffer: number, depth: number, stencil: number): void {
    throw new Error('Method not implemented.');
  }
  clearBufferiv(buffer: number, drawbuffer: number, values: Int32List, srcOffset?: number | undefined): void;
  clearBufferiv(buffer: number, drawbuffer: number, values: Iterable<number>, srcOffset?: number | undefined): void;
  clearBufferiv(buffer: unknown, drawbuffer: unknown, values: unknown, srcOffset?: unknown): void {
    throw new Error('Method not implemented.');
  }
  clearBufferuiv(buffer: number, drawbuffer: number, values: Uint32List, srcOffset?: number | undefined): void;
  clearBufferuiv(buffer: number, drawbuffer: number, values: Iterable<number>, srcOffset?: number | undefined): void;
  clearBufferuiv(buffer: unknown, drawbuffer: unknown, values: unknown, srcOffset?: unknown): void {
    throw new Error('Method not implemented.');
  }
  clientWaitSync(sync: WebGLSync, flags: number, timeout: number): number {
    throw new Error('Method not implemented.');
  }
  compressedTexImage3D(
    target: number,
    level: number,
    internalformat: number,
    width: number,
    height: number,
    depth: number,
    border: number,
    imageSize: number,
    offset: number
  ): void;
  compressedTexImage3D(
    target: number,
    level: number,
    internalformat: number,
    width: number,
    height: number,
    depth: number,
    border: number,
    srcData: ArrayBufferView,
    srcOffset?: number | undefined,
    srcLengthOverride?: number | undefined
  ): void;
  compressedTexImage3D(
    target: unknown,
    level: unknown,
    internalformat: unknown,
    width: unknown,
    height: unknown,
    depth: unknown,
    border: unknown,
    srcData: unknown,
    srcOffset?: unknown,
    srcLengthOverride?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  compressedTexSubImage3D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    zoffset: number,
    width: number,
    height: number,
    depth: number,
    format: number,
    imageSize: number,
    offset: number
  ): void;
  compressedTexSubImage3D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    zoffset: number,
    width: number,
    height: number,
    depth: number,
    format: number,
    srcData: ArrayBufferView,
    srcOffset?: number | undefined,
    srcLengthOverride?: number | undefined
  ): void;
  compressedTexSubImage3D(
    target: unknown,
    level: unknown,
    xoffset: unknown,
    yoffset: unknown,
    zoffset: unknown,
    width: unknown,
    height: unknown,
    depth: unknown,
    format: unknown,
    srcData: unknown,
    srcOffset?: unknown,
    srcLengthOverride?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  copyBufferSubData(
    readTarget: number,
    writeTarget: number,
    readOffset: number,
    writeOffset: number,
    size: number
  ): void {
    throw new Error('Method not implemented.');
  }
  copyTexSubImage3D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    zoffset: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    throw new Error('Method not implemented.');
  }
  createQuery(): WebGLQuery | null {
    throw new Error('Method not implemented.');
  }
  createSampler(): WebGLSampler | null {
    throw new Error('Method not implemented.');
  }
  createTransformFeedback(): WebGLTransformFeedback | null {
    throw new Error('Method not implemented.');
  }
  deleteQuery(query: WebGLQuery | null): void {
    throw new Error('Method not implemented.');
  }
  deleteSampler(sampler: WebGLSampler | null): void {
    throw new Error('Method not implemented.');
  }
  deleteSync(sync: WebGLSync | null): void {
    throw new Error('Method not implemented.');
  }
  deleteTransformFeedback(tf: WebGLTransformFeedback | null): void {
    throw new Error('Method not implemented.');
  }
  deleteVertexArray(vertexArray: WebGLVertexArrayObject | null): void {
    throw new Error('Method not implemented.');
  }
  drawArraysInstanced(mode: number, first: number, count: number, instanceCount: number): void {
    throw new Error('Method not implemented.');
  }
  drawElementsInstanced(mode: number, count: number, type: number, offset: number, instanceCount: number): void {
    throw new Error('Method not implemented.');
  }
  drawRangeElements(mode: number, start: number, end: number, count: number, type: number, offset: number): void {
    throw new Error('Method not implemented.');
  }
  endQuery(target: number): void {
    throw new Error('Method not implemented.');
  }
  endTransformFeedback(): void {
    throw new Error('Method not implemented.');
  }
  fenceSync(condition: number, flags: number): WebGLSync | null {
    throw new Error('Method not implemented.');
  }
  framebufferTextureLayer(
    target: number,
    attachment: number,
    texture: WebGLTexture | null,
    level: number,
    layer: number
  ): void {
    throw new Error('Method not implemented.');
  }
  getActiveUniformBlockName(program: WebGLProgram, uniformBlockIndex: number): string | null {
    throw new Error('Method not implemented.');
  }
  getActiveUniformBlockParameter(program: WebGLProgram, uniformBlockIndex: number, pname: number) {
    throw new Error('Method not implemented.');
  }

  getActiveUniforms(program: WebGLProgram, uniformIndices: number[] | Iterable<number>, pname: number): any {
    this.gl.getActiveUniforms(program, uniformIndices, pname);
  }

  getBufferSubData(
    target: number,
    srcByteOffset: number,
    dstBuffer: ArrayBufferView,
    dstOffset?: number | undefined,
    length?: number | undefined
  ): void {
    this.gl.getBufferSubData(target, srcByteOffset, dstBuffer, dstOffset, length);
  }
  getFragDataLocation(program: WebGLProgram, name: string): number {
    throw new Error('Method not implemented.');
  }
  getIndexedParameter(target: number, index: number) {
    throw new Error('Method not implemented.');
  }
  getInternalformatParameter(target: number, internalformat: number, pname: number) {
    throw new Error('Method not implemented.');
  }
  getQuery(target: number, pname: number): WebGLQuery | null {
    throw new Error('Method not implemented.');
  }
  getQueryParameter(query: WebGLQuery, pname: number) {
    throw new Error('Method not implemented.');
  }
  getSamplerParameter(sampler: WebGLSampler, pname: number) {
    throw new Error('Method not implemented.');
  }
  getSyncParameter(sync: WebGLSync, pname: number) {
    throw new Error('Method not implemented.');
  }
  getTransformFeedbackVarying(program: WebGLProgram, index: number): WebGLActiveInfo | null {
    throw new Error('Method not implemented.');
  }
  getUniformBlockIndex(program: WebGLProgram, uniformBlockName: string): number {
    throw new Error('Method not implemented.');
  }
  getUniformIndices(program: WebGLProgram, uniformNames: string[]): number[] | null;
  getUniformIndices(program: WebGLProgram, uniformNames: Iterable<string>): Iterable<number> | null;
  getUniformIndices(program: unknown, uniformNames: unknown): Iterable<number> | number[] | null {
    throw new Error('Method not implemented.');
  }
  invalidateFramebuffer(target: number, attachments: number[]): void;
  invalidateFramebuffer(target: number, attachments: Iterable<number>): void;
  invalidateFramebuffer(target: unknown, attachments: unknown): void {
    throw new Error('Method not implemented.');
  }
  invalidateSubFramebuffer(
    target: number,
    attachments: number[],
    x: number,
    y: number,
    width: number,
    height: number
  ): void;
  invalidateSubFramebuffer(
    target: number,
    attachments: Iterable<number>,
    x: number,
    y: number,
    width: number,
    height: number
  ): void;
  invalidateSubFramebuffer(
    target: unknown,
    attachments: unknown,
    x: unknown,
    y: unknown,
    width: unknown,
    height: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  isQuery(query: WebGLQuery | null): boolean {
    throw new Error('Method not implemented.');
  }
  isSampler(sampler: WebGLSampler | null): boolean {
    throw new Error('Method not implemented.');
  }
  isSync(sync: WebGLSync | null): boolean {
    throw new Error('Method not implemented.');
  }
  isTransformFeedback(tf: WebGLTransformFeedback | null): boolean {
    throw new Error('Method not implemented.');
  }
  isVertexArray(vertexArray: WebGLVertexArrayObject | null): boolean {
    throw new Error('Method not implemented.');
  }
  pauseTransformFeedback(): void {
    throw new Error('Method not implemented.');
  }
  readBuffer(src: number): void {
    throw new Error('Method not implemented.');
  }
  resumeTransformFeedback(): void {
    throw new Error('Method not implemented.');
  }
  samplerParameterf(sampler: WebGLSampler, pname: number, param: number): void {
    throw new Error('Method not implemented.');
  }
  samplerParameteri(sampler: WebGLSampler, pname: number, param: number): void {
    throw new Error('Method not implemented.');
  }
  texImage3D(
    target: number,
    level: number,
    internalformat: number,
    width: number,
    height: number,
    depth: number,
    border: number,
    format: number,
    type: number,
    pboOffset: number
  ): void;
  texImage3D(
    target: number,
    level: number,
    internalformat: number,
    width: number,
    height: number,
    depth: number,
    border: number,
    format: number,
    type: number,
    source: TexImageSource
  ): void;
  texImage3D(
    target: number,
    level: number,
    internalformat: number,
    width: number,
    height: number,
    depth: number,
    border: number,
    format: number,
    type: number,
    srcData: ArrayBufferView | null
  ): void;
  texImage3D(
    target: number,
    level: number,
    internalformat: number,
    width: number,
    height: number,
    depth: number,
    border: number,
    format: number,
    type: number,
    srcData: ArrayBufferView,
    srcOffset: number
  ): void;
  texImage3D(
    target: unknown,
    level: unknown,
    internalformat: unknown,
    width: unknown,
    height: unknown,
    depth: unknown,
    border: unknown,
    format: unknown,
    type: unknown,
    srcData: unknown,
    srcOffset?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  texStorage3D(
    target: number,
    levels: number,
    internalformat: number,
    width: number,
    height: number,
    depth: number
  ): void {
    throw new Error('Method not implemented.');
  }
  texSubImage3D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    zoffset: number,
    width: number,
    height: number,
    depth: number,
    format: number,
    type: number,
    pboOffset: number
  ): void;
  texSubImage3D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    zoffset: number,
    width: number,
    height: number,
    depth: number,
    format: number,
    type: number,
    source: TexImageSource
  ): void;
  texSubImage3D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    zoffset: number,
    width: number,
    height: number,
    depth: number,
    format: number,
    type: number,
    srcData: ArrayBufferView | null,
    srcOffset?: number | undefined
  ): void;
  texSubImage3D(
    target: unknown,
    level: unknown,
    xoffset: unknown,
    yoffset: unknown,
    zoffset: unknown,
    width: unknown,
    height: unknown,
    depth: unknown,
    format: unknown,
    type: unknown,
    srcData: unknown,
    srcOffset?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  uniform1ui(location: WebGLUniformLocation | null, v0: number): void {
    throw new Error('Method not implemented.');
  }
  uniform1uiv(
    location: WebGLUniformLocation | null,
    data: Uint32List,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniform1uiv(
    location: WebGLUniformLocation | null,
    data: Iterable<number>,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniform1uiv(location: unknown, data: unknown, srcOffset?: unknown, srcLength?: unknown): void {
    throw new Error('Method not implemented.');
  }
  uniform2ui(location: WebGLUniformLocation | null, v0: number, v1: number): void {
    throw new Error('Method not implemented.');
  }
  uniform2uiv(
    location: WebGLUniformLocation | null,
    data: Uint32List,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniform2uiv(
    location: WebGLUniformLocation | null,
    data: Iterable<number>,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniform2uiv(location: unknown, data: unknown, srcOffset?: unknown, srcLength?: unknown): void {
    throw new Error('Method not implemented.');
  }
  uniform3ui(location: WebGLUniformLocation | null, v0: number, v1: number, v2: number): void {
    throw new Error('Method not implemented.');
  }
  uniform3uiv(
    location: WebGLUniformLocation | null,
    data: Uint32List,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniform3uiv(
    location: WebGLUniformLocation | null,
    data: Iterable<number>,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniform3uiv(location: unknown, data: unknown, srcOffset?: unknown, srcLength?: unknown): void {
    throw new Error('Method not implemented.');
  }
  uniform4ui(location: WebGLUniformLocation | null, v0: number, v1: number, v2: number, v3: number): void {
    throw new Error('Method not implemented.');
  }
  uniform4uiv(
    location: WebGLUniformLocation | null,
    data: Uint32List,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniform4uiv(
    location: WebGLUniformLocation | null,
    data: Iterable<number>,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniform4uiv(location: unknown, data: unknown, srcOffset?: unknown, srcLength?: unknown): void {
    throw new Error('Method not implemented.');
  }
  uniformBlockBinding(program: WebGLProgram, uniformBlockIndex: number, uniformBlockBinding: number): void {
    throw new Error('Method not implemented.');
  }
  uniformMatrix2x3fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Float32List,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniformMatrix2x3fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Iterable<number>,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniformMatrix2x3fv(
    location: unknown,
    transpose: unknown,
    data: unknown,
    srcOffset?: unknown,
    srcLength?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  uniformMatrix2x4fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Float32List,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniformMatrix2x4fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Iterable<number>,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniformMatrix2x4fv(
    location: unknown,
    transpose: unknown,
    data: unknown,
    srcOffset?: unknown,
    srcLength?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  uniformMatrix3x2fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Float32List,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniformMatrix3x2fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Iterable<number>,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniformMatrix3x2fv(
    location: unknown,
    transpose: unknown,
    data: unknown,
    srcOffset?: unknown,
    srcLength?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  uniformMatrix3x4fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Float32List,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniformMatrix3x4fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Iterable<number>,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniformMatrix3x4fv(
    location: unknown,
    transpose: unknown,
    data: unknown,
    srcOffset?: unknown,
    srcLength?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  uniformMatrix4x2fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Float32List,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniformMatrix4x2fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Iterable<number>,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniformMatrix4x2fv(
    location: unknown,
    transpose: unknown,
    data: unknown,
    srcOffset?: unknown,
    srcLength?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  uniformMatrix4x3fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Float32List,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniformMatrix4x3fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    data: Iterable<number>,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniformMatrix4x3fv(
    location: unknown,
    transpose: unknown,
    data: unknown,
    srcOffset?: unknown,
    srcLength?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  vertexAttribI4i(index: number, x: number, y: number, z: number, w: number): void {
    throw new Error('Method not implemented.');
  }
  vertexAttribI4iv(index: number, values: Int32List): void;
  vertexAttribI4iv(index: number, values: Iterable<number>): void;
  vertexAttribI4iv(index: unknown, values: unknown): void {
    throw new Error('Method not implemented.');
  }
  vertexAttribI4ui(index: number, x: number, y: number, z: number, w: number): void {
    throw new Error('Method not implemented.');
  }
  vertexAttribI4uiv(index: number, values: Uint32List): void;
  vertexAttribI4uiv(index: number, values: Iterable<number>): void;
  vertexAttribI4uiv(index: unknown, values: unknown): void {
    throw new Error('Method not implemented.');
  }
  vertexAttribIPointer(index: number, size: number, type: number, stride: number, offset: number): void {
    throw new Error('Method not implemented.');
  }
  waitSync(sync: WebGLSync, flags: number, timeout: number): void {
    throw new Error('Method not implemented.');
  }
  READ_BUFFER = this.gl.READ_BUFFER;
  UNPACK_ROW_LENGTH = this.gl.UNPACK_ROW_LENGTH;
  UNPACK_SKIP_ROWS = this.gl.UNPACK_SKIP_ROWS;
  UNPACK_SKIP_PIXELS = this.gl.UNPACK_SKIP_PIXELS;
  PACK_ROW_LENGTH = this.gl.PACK_ROW_LENGTH;
  PACK_SKIP_ROWS = this.gl.PACK_SKIP_ROWS;
  PACK_SKIP_PIXELS = this.gl.PACK_SKIP_PIXELS;
  COLOR = this.gl.COLOR;
  DEPTH = this.gl.DEPTH;
  STENCIL = this.gl.STENCIL;
  RED = this.gl.RED;
  RGB8 = this.gl.RGB8;
  RGBA8 = this.gl.RGBA8;
  RGB10_A2 = this.gl.RGB10_A2;
  TEXTURE_BINDING_3D = this.gl.TEXTURE_BINDING_3D;
  UNPACK_SKIP_IMAGES = this.gl.UNPACK_SKIP_IMAGES;
  UNPACK_IMAGE_HEIGHT = this.gl.UNPACK_IMAGE_HEIGHT;
  TEXTURE_3D = this.gl.TEXTURE_3D;
  TEXTURE_WRAP_R = this.gl.TEXTURE_WRAP_R;
  MAX_3D_TEXTURE_SIZE = this.gl.MAX_3D_TEXTURE_SIZE;
  UNSIGNED_INT_2_10_10_10_REV = this.gl.UNSIGNED_INT_2_10_10_10_REV;
  MAX_ELEMENTS_VERTICES = this.gl.MAX_ELEMENTS_VERTICES;
  MAX_ELEMENTS_INDICES = this.gl.MAX_ELEMENTS_INDICES;
  TEXTURE_MIN_LOD = this.gl.TEXTURE_MIN_LOD;
  TEXTURE_MAX_LOD = this.gl.TEXTURE_MAX_LOD;
  TEXTURE_BASE_LEVEL = this.gl.TEXTURE_BASE_LEVEL;
  TEXTURE_MAX_LEVEL = this.gl.TEXTURE_MAX_LEVEL;
  DEPTH_COMPONENT24 = this.gl.DEPTH_COMPONENT24;
  MAX_TEXTURE_LOD_BIAS = this.gl.MAX_TEXTURE_LOD_BIAS;
  TEXTURE_COMPARE_MODE = this.gl.TEXTURE_COMPARE_MODE;
  TEXTURE_COMPARE_FUNC = this.gl.TEXTURE_COMPARE_FUNC;
  CURRENT_QUERY = this.gl.CURRENT_QUERY;
  QUERY_RESULT = this.gl.QUERY_RESULT;
  QUERY_RESULT_AVAILABLE = this.gl.QUERY_RESULT_AVAILABLE;
  STREAM_READ = this.gl.STREAM_READ;
  STREAM_COPY = this.gl.STREAM_COPY;
  STATIC_READ = this.gl.STATIC_READ;
  STATIC_COPY = this.gl.STATIC_COPY;
  DYNAMIC_READ = this.gl.DYNAMIC_READ;
  DYNAMIC_COPY = this.gl.DYNAMIC_COPY;
  MAX_DRAW_BUFFERS = this.gl.MAX_DRAW_BUFFERS;
  DRAW_BUFFER0 = this.gl.DRAW_BUFFER0;
  DRAW_BUFFER1 = this.gl.DRAW_BUFFER1;
  DRAW_BUFFER2 = this.gl.DRAW_BUFFER2;
  DRAW_BUFFER3 = this.gl.DRAW_BUFFER3;
  DRAW_BUFFER4 = this.gl.DRAW_BUFFER4;
  DRAW_BUFFER5 = this.gl.DRAW_BUFFER5;
  DRAW_BUFFER6 = this.gl.DRAW_BUFFER6;
  DRAW_BUFFER7 = this.gl.DRAW_BUFFER7;
  DRAW_BUFFER8 = this.gl.DRAW_BUFFER8;
  DRAW_BUFFER9 = this.gl.DRAW_BUFFER9;
  DRAW_BUFFER10 = this.gl.DRAW_BUFFER10;
  DRAW_BUFFER11 = this.gl.DRAW_BUFFER11;
  DRAW_BUFFER12 = this.gl.DRAW_BUFFER12;
  DRAW_BUFFER13 = this.gl.DRAW_BUFFER13;
  DRAW_BUFFER14 = this.gl.DRAW_BUFFER14;
  DRAW_BUFFER15 = this.gl.DRAW_BUFFER15;
  MAX_FRAGMENT_UNIFORM_COMPONENTS = this.gl.MAX_FRAGMENT_UNIFORM_COMPONENTS;
  MAX_VERTEX_UNIFORM_COMPONENTS = this.gl.MAX_VERTEX_UNIFORM_COMPONENTS;
  SAMPLER_3D = this.gl.SAMPLER_3D;
  SAMPLER_2D_SHADOW = this.gl.SAMPLER_2D_SHADOW;
  FRAGMENT_SHADER_DERIVATIVE_HINT = this.gl.FRAGMENT_SHADER_DERIVATIVE_HINT;
  PIXEL_PACK_BUFFER = this.gl.PIXEL_PACK_BUFFER;
  PIXEL_UNPACK_BUFFER = this.gl.PIXEL_UNPACK_BUFFER;
  PIXEL_PACK_BUFFER_BINDING = this.gl.PIXEL_PACK_BUFFER_BINDING;
  PIXEL_UNPACK_BUFFER_BINDING = this.gl.PIXEL_UNPACK_BUFFER_BINDING;
  FLOAT_MAT2x3 = this.gl.FLOAT_MAT2x3;
  FLOAT_MAT2x4 = this.gl.FLOAT_MAT2x4;
  FLOAT_MAT3x2 = this.gl.FLOAT_MAT3x2;
  FLOAT_MAT3x4 = this.gl.FLOAT_MAT3x4;
  FLOAT_MAT4x2 = this.gl.FLOAT_MAT4x2;
  FLOAT_MAT4x3 = this.gl.FLOAT_MAT4x3;
  COMPARE_REF_TO_TEXTURE = this.gl.COMPARE_REF_TO_TEXTURE;
  RGB32F = this.gl.RGB32F;
  RGB16F = this.gl.RGB16F;
  VERTEX_ATTRIB_ARRAY_INTEGER = this.gl.VERTEX_ATTRIB_ARRAY_INTEGER;
  MAX_ARRAY_TEXTURE_LAYERS = this.gl.MAX_ARRAY_TEXTURE_LAYERS;
  MIN_PROGRAM_TEXEL_OFFSET = this.gl.MIN_PROGRAM_TEXEL_OFFSET;
  MAX_PROGRAM_TEXEL_OFFSET = this.gl.MAX_PROGRAM_TEXEL_OFFSET;
  MAX_VARYING_COMPONENTS = this.gl.MAX_VARYING_COMPONENTS;
  TEXTURE_2D_ARRAY = this.gl.TEXTURE_2D_ARRAY;
  TEXTURE_BINDING_2D_ARRAY = this.gl.TEXTURE_BINDING_2D_ARRAY;
  R11F_G11F_B10F = this.gl.R11F_G11F_B10F;
  UNSIGNED_INT_10F_11F_11F_REV = this.gl.UNSIGNED_INT_10F_11F_11F_REV;
  RGB9_E5 = this.gl.RGB9_E5;
  UNSIGNED_INT_5_9_9_9_REV = this.gl.UNSIGNED_INT_5_9_9_9_REV;
  TRANSFORM_FEEDBACK_BUFFER_MODE = this.gl.TRANSFORM_FEEDBACK_BUFFER_MODE;
  MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS = this.gl.MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS;
  TRANSFORM_FEEDBACK_VARYINGS = this.gl.TRANSFORM_FEEDBACK_VARYINGS;
  TRANSFORM_FEEDBACK_BUFFER_START = this.gl.TRANSFORM_FEEDBACK_BUFFER_START;
  TRANSFORM_FEEDBACK_BUFFER_SIZE = this.gl.TRANSFORM_FEEDBACK_BUFFER_SIZE;
  TRANSFORM_FEEDBACK_PRIMITIVES_WRITTEN = this.gl.TRANSFORM_FEEDBACK_PRIMITIVES_WRITTEN;
  RASTERIZER_DISCARD = this.gl.RASTERIZER_DISCARD;
  MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS = this.gl.MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS;
  MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS = this.gl.MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS;
  INTERLEAVED_ATTRIBS = this.gl.INTERLEAVED_ATTRIBS;
  SEPARATE_ATTRIBS = this.gl.SEPARATE_ATTRIBS;
  TRANSFORM_FEEDBACK_BUFFER = this.gl.TRANSFORM_FEEDBACK_BUFFER;
  TRANSFORM_FEEDBACK_BUFFER_BINDING = this.gl.TRANSFORM_FEEDBACK_BUFFER_BINDING;
  RGBA32UI = this.gl.RGBA32UI;
  RGB32UI = this.gl.RGB32UI;
  RGBA16UI = this.gl.RGBA16UI;
  RGB16UI = this.gl.RGB16UI;
  RGBA8UI = this.gl.RGBA8UI;
  RGB8UI = this.gl.RGB8UI;
  RGBA32I = this.gl.RGBA32I;
  RGB32I = this.gl.RGB32I;
  RGBA16I = this.gl.RGBA16I;
  RGB16I = this.gl.RGB16I;
  RGBA8I = this.gl.RGBA8I;
  RGB8I = this.gl.RGB8I;
  RED_INTEGER = this.gl.RED_INTEGER;
  RGB_INTEGER = this.gl.RGB_INTEGER;
  RGBA_INTEGER = this.gl.RGBA_INTEGER;
  SAMPLER_2D_ARRAY = this.gl.SAMPLER_2D_ARRAY;
  SAMPLER_2D_ARRAY_SHADOW = this.gl.SAMPLER_2D_ARRAY_SHADOW;
  SAMPLER_CUBE_SHADOW = this.gl.SAMPLER_CUBE_SHADOW;
  UNSIGNED_INT_VEC2 = this.gl.UNSIGNED_INT_VEC2;
  UNSIGNED_INT_VEC3 = this.gl.UNSIGNED_INT_VEC3;
  UNSIGNED_INT_VEC4 = this.gl.UNSIGNED_INT_VEC4;
  INT_SAMPLER_2D = this.gl.INT_SAMPLER_2D;
  INT_SAMPLER_3D = this.gl.INT_SAMPLER_3D;
  INT_SAMPLER_CUBE = this.gl.INT_SAMPLER_CUBE;
  INT_SAMPLER_2D_ARRAY = this.gl.INT_SAMPLER_2D_ARRAY;
  UNSIGNED_INT_SAMPLER_2D = this.gl.UNSIGNED_INT_SAMPLER_2D;
  UNSIGNED_INT_SAMPLER_3D = this.gl.UNSIGNED_INT_SAMPLER_3D;
  UNSIGNED_INT_SAMPLER_CUBE = this.gl.UNSIGNED_INT_SAMPLER_CUBE;
  UNSIGNED_INT_SAMPLER_2D_ARRAY = this.gl.UNSIGNED_INT_SAMPLER_2D_ARRAY;
  DEPTH_COMPONENT32F = this.gl.DEPTH_COMPONENT32F;
  DEPTH32F_STENCIL8 = this.gl.DEPTH32F_STENCIL8;
  FLOAT_32_UNSIGNED_INT_24_8_REV = this.gl.FLOAT_32_UNSIGNED_INT_24_8_REV;
  FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING = this.gl.FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING;
  FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE = this.gl.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE;
  FRAMEBUFFER_ATTACHMENT_RED_SIZE = this.gl.FRAMEBUFFER_ATTACHMENT_RED_SIZE;
  FRAMEBUFFER_ATTACHMENT_GREEN_SIZE = this.gl.FRAMEBUFFER_ATTACHMENT_GREEN_SIZE;
  FRAMEBUFFER_ATTACHMENT_BLUE_SIZE = this.gl.FRAMEBUFFER_ATTACHMENT_BLUE_SIZE;
  FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE = this.gl.FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE;
  FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE = this.gl.FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE;
  FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE = this.gl.FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE;
  FRAMEBUFFER_DEFAULT = this.gl.FRAMEBUFFER_DEFAULT;
  UNSIGNED_NORMALIZED = this.gl.UNSIGNED_NORMALIZED;
  DRAW_FRAMEBUFFER_BINDING = this.gl.DRAW_FRAMEBUFFER_BINDING;
  READ_FRAMEBUFFER = this.gl.READ_FRAMEBUFFER;
  READ_FRAMEBUFFER_BINDING = this.gl.READ_FRAMEBUFFER_BINDING;
  RENDERBUFFER_SAMPLES = this.gl.RENDERBUFFER_SAMPLES;
  FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER = this.gl.FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER;
  MAX_COLOR_ATTACHMENTS = this.gl.MAX_COLOR_ATTACHMENTS;
  COLOR_ATTACHMENT1 = this.gl.COLOR_ATTACHMENT1;
  COLOR_ATTACHMENT2 = this.gl.COLOR_ATTACHMENT2;
  COLOR_ATTACHMENT3 = this.gl.COLOR_ATTACHMENT3;
  COLOR_ATTACHMENT4 = this.gl.COLOR_ATTACHMENT4;
  COLOR_ATTACHMENT5 = this.gl.COLOR_ATTACHMENT5;
  COLOR_ATTACHMENT6 = this.gl.COLOR_ATTACHMENT6;
  COLOR_ATTACHMENT7 = this.gl.COLOR_ATTACHMENT7;
  COLOR_ATTACHMENT8 = this.gl.COLOR_ATTACHMENT8;
  COLOR_ATTACHMENT9 = this.gl.COLOR_ATTACHMENT9;
  COLOR_ATTACHMENT10 = this.gl.COLOR_ATTACHMENT10;
  COLOR_ATTACHMENT11 = this.gl.COLOR_ATTACHMENT11;
  COLOR_ATTACHMENT12 = this.gl.COLOR_ATTACHMENT12;
  COLOR_ATTACHMENT13 = this.gl.COLOR_ATTACHMENT13;
  COLOR_ATTACHMENT14 = this.gl.COLOR_ATTACHMENT14;
  COLOR_ATTACHMENT15 = this.gl.COLOR_ATTACHMENT15;
  FRAMEBUFFER_INCOMPLETE_MULTISAMPLE = this.gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE;
  MAX_SAMPLES = this.gl.MAX_SAMPLES;
  HALF_FLOAT = this.gl.HALF_FLOAT;
  RG = this.gl.RG;
  RG_INTEGER = this.gl.RG_INTEGER;
  R8 = this.gl.R8;
  RG8 = this.gl.RG8;
  R16F = this.gl.R16F;
  R32F = this.gl.R32F;
  RG16F = this.gl.RG16F;
  RG32F = this.gl.RG32F;
  R8I = this.gl.R8I;
  R8UI = this.gl.R8UI;
  R16I = this.gl.R16I;
  R16UI = this.gl.R16UI;
  R32I = this.gl.R32I;
  R32UI = this.gl.R32UI;
  RG8I = this.gl.RG8I;
  RG8UI = this.gl.RG8UI;
  RG16I = this.gl.RG16I;
  RG16UI = this.gl.RG16UI;
  RG32I = this.gl.RG32I;
  RG32UI = this.gl.RG32UI;
  VERTEX_ARRAY_BINDING = this.gl.VERTEX_ARRAY_BINDING;
  R8_SNORM = this.gl.R8_SNORM;
  RG8_SNORM = this.gl.RG8_SNORM;
  RGB8_SNORM = this.gl.RGB8_SNORM;
  RGBA8_SNORM = this.gl.RGBA8_SNORM;
  SIGNED_NORMALIZED = this.gl.SIGNED_NORMALIZED;
  COPY_READ_BUFFER = this.gl.COPY_READ_BUFFER;
  COPY_WRITE_BUFFER = this.gl.COPY_WRITE_BUFFER;
  COPY_READ_BUFFER_BINDING = this.gl.COPY_READ_BUFFER_BINDING;
  COPY_WRITE_BUFFER_BINDING = this.gl.COPY_WRITE_BUFFER_BINDING;
  UNIFORM_BUFFER = this.gl.UNIFORM_BUFFER;
  UNIFORM_BUFFER_BINDING = this.gl.UNIFORM_BUFFER_BINDING;
  UNIFORM_BUFFER_START = this.gl.UNIFORM_BUFFER_START;
  UNIFORM_BUFFER_SIZE = this.gl.UNIFORM_BUFFER_SIZE;
  MAX_VERTEX_UNIFORM_BLOCKS = this.gl.MAX_VERTEX_UNIFORM_BLOCKS;
  MAX_FRAGMENT_UNIFORM_BLOCKS = this.gl.MAX_FRAGMENT_UNIFORM_BLOCKS;
  MAX_COMBINED_UNIFORM_BLOCKS = this.gl.MAX_COMBINED_UNIFORM_BLOCKS;
  MAX_UNIFORM_BUFFER_BINDINGS = this.gl.MAX_UNIFORM_BUFFER_BINDINGS;
  MAX_UNIFORM_BLOCK_SIZE = this.gl.MAX_UNIFORM_BLOCK_SIZE;
  MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS = this.gl.MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS;
  MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS = this.gl.MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS;
  UNIFORM_BUFFER_OFFSET_ALIGNMENT = this.gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT;
  ACTIVE_UNIFORM_BLOCKS = this.gl.ACTIVE_UNIFORM_BLOCKS;
  UNIFORM_TYPE = this.gl.UNIFORM_TYPE;
  UNIFORM_SIZE = this.gl.UNIFORM_SIZE;
  UNIFORM_BLOCK_INDEX = this.gl.UNIFORM_BLOCK_INDEX;
  UNIFORM_OFFSET = this.gl.UNIFORM_OFFSET;
  UNIFORM_ARRAY_STRIDE = this.gl.UNIFORM_ARRAY_STRIDE;
  UNIFORM_MATRIX_STRIDE = this.gl.UNIFORM_MATRIX_STRIDE;
  UNIFORM_IS_ROW_MAJOR = this.gl.UNIFORM_IS_ROW_MAJOR;
  UNIFORM_BLOCK_BINDING = this.gl.UNIFORM_BLOCK_BINDING;
  UNIFORM_BLOCK_DATA_SIZE = this.gl.UNIFORM_BLOCK_DATA_SIZE;
  UNIFORM_BLOCK_ACTIVE_UNIFORMS = this.gl.UNIFORM_BLOCK_ACTIVE_UNIFORMS;
  UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES = this.gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES;
  UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER = this.gl.UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER;
  UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER = this.gl.UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER;
  INVALID_INDEX = this.gl.INVALID_INDEX;
  MAX_VERTEX_OUTPUT_COMPONENTS = this.gl.MAX_VERTEX_OUTPUT_COMPONENTS;
  MAX_FRAGMENT_INPUT_COMPONENTS = this.gl.MAX_FRAGMENT_INPUT_COMPONENTS;
  MAX_SERVER_WAIT_TIMEOUT = this.gl.MAX_SERVER_WAIT_TIMEOUT;
  OBJECT_TYPE = this.gl.OBJECT_TYPE;
  SYNC_CONDITION = this.gl.SYNC_CONDITION;
  SYNC_STATUS = this.gl.SYNC_STATUS;
  SYNC_FLAGS = this.gl.SYNC_FLAGS;
  SYNC_FENCE = this.gl.SYNC_FENCE;
  SYNC_GPU_COMMANDS_COMPLETE = this.gl.SYNC_GPU_COMMANDS_COMPLETE;
  UNSIGNALED = this.gl.UNSIGNALED;
  SIGNALED = this.gl.SIGNALED;
  ALREADY_SIGNALED = this.gl.ALREADY_SIGNALED;
  TIMEOUT_EXPIRED = this.gl.TIMEOUT_EXPIRED;
  CONDITION_SATISFIED = this.gl.CONDITION_SATISFIED;
  WAIT_FAILED = this.gl.WAIT_FAILED;
  SYNC_FLUSH_COMMANDS_BIT = this.gl.SYNC_FLUSH_COMMANDS_BIT;
  VERTEX_ATTRIB_ARRAY_DIVISOR = this.gl.VERTEX_ATTRIB_ARRAY_DIVISOR;
  ANY_SAMPLES_PASSED = this.gl.ANY_SAMPLES_PASSED;
  ANY_SAMPLES_PASSED_CONSERVATIVE = this.gl.ANY_SAMPLES_PASSED_CONSERVATIVE;
  SAMPLER_BINDING = this.gl.SAMPLER_BINDING;
  RGB10_A2UI = this.gl.RGB10_A2UI;
  INT_2_10_10_10_REV = this.gl.INT_2_10_10_10_REV;
  TRANSFORM_FEEDBACK = this.gl.TRANSFORM_FEEDBACK;
  TRANSFORM_FEEDBACK_PAUSED = this.gl.TRANSFORM_FEEDBACK_PAUSED;
  TRANSFORM_FEEDBACK_ACTIVE = this.gl.TRANSFORM_FEEDBACK_ACTIVE;
  TRANSFORM_FEEDBACK_BINDING = this.gl.TRANSFORM_FEEDBACK_BINDING;
  TEXTURE_IMMUTABLE_FORMAT = this.gl.TEXTURE_IMMUTABLE_FORMAT;
  MAX_ELEMENT_INDEX = this.gl.MAX_ELEMENT_INDEX;
  TEXTURE_IMMUTABLE_LEVELS = this.gl.TEXTURE_IMMUTABLE_LEVELS;
  TIMEOUT_IGNORED = this.gl.TIMEOUT_IGNORED;
  MAX_CLIENT_WAIT_TIMEOUT_WEBGL = this.gl.MAX_CLIENT_WAIT_TIMEOUT_WEBGL;
  bufferSubData(target: number, dstByteOffset: number, srcData: BufferSource): void;
  bufferSubData(
    target: number,
    dstByteOffset: number,
    srcData: ArrayBufferView,
    srcOffset: number,
    length?: number | undefined
  ): void;
  bufferSubData(
    target: unknown,
    dstByteOffset: unknown,
    srcData: unknown,
    srcOffset?: unknown,
    length?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  compressedTexImage2D(
    target: number,
    level: number,
    internalformat: number,
    width: number,
    height: number,
    border: number,
    imageSize: number,
    offset: number
  ): void;
  compressedTexImage2D(
    target: number,
    level: number,
    internalformat: number,
    width: number,
    height: number,
    border: number,
    srcData: ArrayBufferView,
    srcOffset?: number | undefined,
    srcLengthOverride?: number | undefined
  ): void;
  compressedTexImage2D(
    target: unknown,
    level: unknown,
    internalformat: unknown,
    width: unknown,
    height: unknown,
    border: unknown,
    srcData: unknown,
    srcOffset?: unknown,
    srcLengthOverride?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  compressedTexSubImage2D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    width: number,
    height: number,
    format: number,
    imageSize: number,
    offset: number
  ): void;
  compressedTexSubImage2D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    width: number,
    height: number,
    format: number,
    srcData: ArrayBufferView,
    srcOffset?: number | undefined,
    srcLengthOverride?: number | undefined
  ): void;
  compressedTexSubImage2D(
    target: unknown,
    level: unknown,
    xoffset: unknown,
    yoffset: unknown,
    width: unknown,
    height: unknown,
    format: unknown,
    srcData: unknown,
    srcOffset?: unknown,
    srcLengthOverride?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  readPixels(
    x: number,
    y: number,
    width: number,
    height: number,
    format: number,
    type: number,
    dstData: ArrayBufferView | null
  ): void;
  readPixels(x: number, y: number, width: number, height: number, format: number, type: number, offset: number): void;
  readPixels(
    x: number,
    y: number,
    width: number,
    height: number,
    format: number,
    type: number,
    dstData: ArrayBufferView,
    dstOffset: number
  ): void;
  readPixels(
    x: unknown,
    y: unknown,
    width: unknown,
    height: unknown,
    format: unknown,
    type: unknown,
    dstData: unknown,
    dstOffset?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  texSubImage2D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    width: number,
    height: number,
    format: number,
    type: number,
    pixels: ArrayBufferView | null
  ): void;
  texSubImage2D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    format: number,
    type: number,
    source: TexImageSource
  ): void;
  texSubImage2D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    width: number,
    height: number,
    format: number,
    type: number,
    pboOffset: number
  ): void;
  texSubImage2D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    width: number,
    height: number,
    format: number,
    type: number,
    source: TexImageSource
  ): void;
  texSubImage2D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    width: number,
    height: number,
    format: number,
    type: number,
    srcData: ArrayBufferView,
    srcOffset: number
  ): void;
  texSubImage2D(
    target: unknown,
    level: unknown,
    xoffset: unknown,
    yoffset: unknown,
    width: unknown,
    height: unknown,
    format: unknown,
    type?: unknown,
    srcData?: unknown,
    srcOffset?: unknown
  ): void {
    throw new Error('Method not implemented.');
  }
  uniform1fv(
    location: WebGLUniformLocation | null,
    data: Float32List,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniform1fv(
    location: WebGLUniformLocation | null,
    data: Iterable<number>,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniform1fv(location: unknown, data: unknown, srcOffset?: unknown, srcLength?: unknown): void {
    throw new Error('Method not implemented.');
  }
  uniform1iv(
    location: WebGLUniformLocation | null,
    data: Int32List,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniform1iv(
    location: WebGLUniformLocation | null,
    data: Iterable<number>,
    srcOffset?: number | undefined,
    srcLength?: number | undefined
  ): void;
  uniform1iv(location: unknown, data: unknown, srcOffset?: unknown, srcLength?: unknown): void {
    throw new Error('Method not implemented.');
  }
  canvas: HTMLCanvasElement | OffscreenCanvas = this.gl.canvas;
  drawingBufferColorSpace: PredefinedColorSpace = this.gl.drawingBufferColorSpace;
  drawingBufferHeight: number = this.gl.drawingBufferHeight;
  drawingBufferWidth: number = this.gl.drawingBufferWidth;
  bindAttribLocation(program: WebGLProgram, index: number, name: string): void {
    throw new Error('Method not implemented.');
  }
  blendColor(red: number, green: number, blue: number, alpha: number): void {
    throw new Error('Method not implemented.');
  }
  blendEquation(mode: number): void {
    throw new Error('Method not implemented.');
  }
  blendEquationSeparate(modeRGB: number, modeAlpha: number): void {
    throw new Error('Method not implemented.');
  }
  blendFuncSeparate(srcRGB: number, dstRGB: number, srcAlpha: number, dstAlpha: number): void {
    throw new Error('Method not implemented.');
  }
  clearDepth(depth: number): void {
    throw new Error('Method not implemented.');
  }
  clearStencil(s: number): void {
    throw new Error('Method not implemented.');
  }
  colorMask(red: boolean, green: boolean, blue: boolean, alpha: boolean): void {
    throw new Error('Method not implemented.');
  }
  copyTexImage2D(
    target: number,
    level: number,
    internalformat: number,
    x: number,
    y: number,
    width: number,
    height: number,
    border: number
  ): void {
    throw new Error('Method not implemented.');
  }
  copyTexSubImage2D(
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    throw new Error('Method not implemented.');
  }
  cullFace(mode: number): void {
    throw new Error('Method not implemented.');
  }
  deleteBuffer(buffer: WebGLBuffer | null): void {
    throw new Error('Method not implemented.');
  }
  deleteFramebuffer(framebuffer: WebGLFramebuffer | null): void {
    throw new Error('Method not implemented.');
  }
  deleteRenderbuffer(renderbuffer: WebGLRenderbuffer | null): void {
    throw new Error('Method not implemented.');
  }
  deleteTexture(texture: WebGLTexture | null): void {
    throw new Error('Method not implemented.');
  }
  depthFunc(func: number): void {
    throw new Error('Method not implemented.');
  }
  depthMask(flag: boolean): void {
    throw new Error('Method not implemented.');
  }
  depthRange(zNear: number, zFar: number): void {
    throw new Error('Method not implemented.');
  }
  disable(cap: number): void {
    throw new Error('Method not implemented.');
  }
  disableVertexAttribArray(index: number): void {
    throw new Error('Method not implemented.');
  }
  drawArrays(mode: number, first: number, count: number): void {
    this.gl.drawArrays(mode, first, count);
  }
  finish(): void {
    throw new Error('Method not implemented.');
  }
  flush(): void {
    throw new Error('Method not implemented.');
  }
  frontFace(mode: number): void {
    throw new Error('Method not implemented.');
  }
  generateMipmap(target: number): void {
    throw new Error('Method not implemented.');
  }
  getActiveAttrib(program: WebGLProgram, index: number): WebGLActiveInfo | null {
    throw new Error('Method not implemented.');
  }
  getActiveUniform(program: WebGLProgram, index: number): WebGLActiveInfo | null {
    throw new Error('Method not implemented.');
  }
  getAttachedShaders(program: WebGLProgram): WebGLShader[] | null {
    throw new Error('Method not implemented.');
  }
  getBufferParameter(target: number, pname: number) {
    throw new Error('Method not implemented.');
  }
  getContextAttributes(): WebGLContextAttributes | null {
    throw new Error('Method not implemented.');
  }
  getError(): number {
    throw new Error('Method not implemented.');
  }
  getFramebufferAttachmentParameter(target: number, attachment: number, pname: number) {
    throw new Error('Method not implemented.');
  }
  getParameter(pname: number) {
    throw new Error('Method not implemented.');
  }
  getRenderbufferParameter(target: number, pname: number) {
    throw new Error('Method not implemented.');
  }
  getShaderPrecisionFormat(shadertype: number, precisiontype: number): WebGLShaderPrecisionFormat | null {
    throw new Error('Method not implemented.');
  }
  getShaderSource(shader: WebGLShader): string | null {
    throw new Error('Method not implemented.');
  }
  getSupportedExtensions(): string[] | null {
    throw new Error('Method not implemented.');
  }
  getTexParameter(target: number, pname: number) {
    throw new Error('Method not implemented.');
  }
  getUniform(program: WebGLProgram, location: WebGLUniformLocation) {
    throw new Error('Method not implemented.');
  }
  getVertexAttrib(index: number, pname: number) {
    throw new Error('Method not implemented.');
  }
  getVertexAttribOffset(index: number, pname: number): number {
    throw new Error('Method not implemented.');
  }
  hint(target: number, mode: number): void {
    throw new Error('Method not implemented.');
  }
  isBuffer(buffer: WebGLBuffer | null): boolean {
    throw new Error('Method not implemented.');
  }
  isContextLost(): boolean {
    throw new Error('Method not implemented.');
  }
  isEnabled(cap: number): boolean {
    throw new Error('Method not implemented.');
  }
  isFramebuffer(framebuffer: WebGLFramebuffer | null): boolean {
    throw new Error('Method not implemented.');
  }
  isProgram(program: WebGLProgram | null): boolean {
    throw new Error('Method not implemented.');
  }
  isRenderbuffer(renderbuffer: WebGLRenderbuffer | null): boolean {
    throw new Error('Method not implemented.');
  }
  isShader(shader: WebGLShader | null): boolean {
    throw new Error('Method not implemented.');
  }
  isTexture(texture: WebGLTexture | null): boolean {
    throw new Error('Method not implemented.');
  }
  lineWidth(width: number): void {
    throw new Error('Method not implemented.');
  }
  pixelStorei(pname: number, param: number | boolean): void {
    throw new Error('Method not implemented.');
  }
  polygonOffset(factor: number, units: number): void {
    throw new Error('Method not implemented.');
  }
  sampleCoverage(value: number, invert: boolean): void {
    throw new Error('Method not implemented.');
  }
  scissor(x: number, y: number, width: number, height: number): void {
    throw new Error('Method not implemented.');
  }
  stencilFunc(func: number, ref: number, mask: number): void {
    throw new Error('Method not implemented.');
  }
  stencilFuncSeparate(face: number, func: number, ref: number, mask: number): void {
    throw new Error('Method not implemented.');
  }
  stencilMask(mask: number): void {
    throw new Error('Method not implemented.');
  }
  stencilMaskSeparate(face: number, mask: number): void {
    throw new Error('Method not implemented.');
  }
  stencilOp(fail: number, zfail: number, zpass: number): void {
    throw new Error('Method not implemented.');
  }
  stencilOpSeparate(face: number, fail: number, zfail: number, zpass: number): void {
    throw new Error('Method not implemented.');
  }
  texParameterf(target: number, pname: number, param: number): void {
    throw new Error('Method not implemented.');
  }
  uniform2f(location: WebGLUniformLocation | null, x: number, y: number): void {
    throw new Error('Method not implemented.');
  }
  uniform2i(location: WebGLUniformLocation | null, x: number, y: number): void {
    throw new Error('Method not implemented.');
  }
  uniform3f(location: WebGLUniformLocation | null, x: number, y: number, z: number): void {
    throw new Error('Method not implemented.');
  }
  uniform3i(location: WebGLUniformLocation | null, x: number, y: number, z: number): void {
    throw new Error('Method not implemented.');
  }
  uniform4f(location: WebGLUniformLocation | null, x: number, y: number, z: number, w: number): void {
    throw new Error('Method not implemented.');
  }
  uniform4i(location: WebGLUniformLocation | null, x: number, y: number, z: number, w: number): void {
    throw new Error('Method not implemented.');
  }
  vertexAttrib1f(index: number, x: number): void {
    throw new Error('Method not implemented.');
  }
  vertexAttrib1fv(index: number, values: Float32List): void;
  vertexAttrib1fv(index: number, values: Iterable<number>): void;
  vertexAttrib1fv(index: unknown, values: unknown): void {
    throw new Error('Method not implemented.');
  }
  vertexAttrib2f(index: number, x: number, y: number): void {
    throw new Error('Method not implemented.');
  }
  vertexAttrib2fv(index: number, values: Float32List): void;
  vertexAttrib2fv(index: number, values: Iterable<number>): void;
  vertexAttrib2fv(index: unknown, values: unknown): void {
    throw new Error('Method not implemented.');
  }
  vertexAttrib3f(index: number, x: number, y: number, z: number): void {
    throw new Error('Method not implemented.');
  }
  vertexAttrib3fv(index: number, values: Float32List): void;
  vertexAttrib3fv(index: number, values: Iterable<number>): void;
  vertexAttrib3fv(index: unknown, values: unknown): void {
    throw new Error('Method not implemented.');
  }
  vertexAttrib4f(index: number, x: number, y: number, z: number, w: number): void {
    throw new Error('Method not implemented.');
  }
  vertexAttrib4fv(index: number, values: Float32List): void;
  vertexAttrib4fv(index: number, values: Iterable<number>): void;
  vertexAttrib4fv(index: unknown, values: unknown): void {
    throw new Error('Method not implemented.');
  }
  DEPTH_BUFFER_BIT = this.gl.DEPTH_BUFFER_BIT;
  STENCIL_BUFFER_BIT = this.gl.STENCIL_BUFFER_BIT;
  COLOR_BUFFER_BIT = this.gl.COLOR_BUFFER_BIT;
  POINTS = this.gl.POINTS;
  LINES = this.gl.LINES;
  LINE_LOOP = this.gl.LINE_LOOP;
  LINE_STRIP = this.gl.LINE_STRIP;
  TRIANGLES = this.gl.TRIANGLES;
  TRIANGLE_STRIP = this.gl.TRIANGLE_STRIP;
  TRIANGLE_FAN = this.gl.TRIANGLE_FAN;
  ZERO = this.gl.ZERO;
  ONE = this.gl.ONE;
  SRC_COLOR = this.gl.SRC_COLOR;
  ONE_MINUS_SRC_COLOR = this.gl.ONE_MINUS_SRC_COLOR;
  SRC_ALPHA = this.gl.SRC_ALPHA;
  ONE_MINUS_SRC_ALPHA = this.gl.ONE_MINUS_SRC_ALPHA;
  DST_ALPHA = this.gl.DST_ALPHA;
  ONE_MINUS_DST_ALPHA = this.gl.ONE_MINUS_DST_ALPHA;
  DST_COLOR = this.gl.DST_COLOR;
  ONE_MINUS_DST_COLOR = this.gl.ONE_MINUS_DST_COLOR;
  SRC_ALPHA_SATURATE = this.gl.SRC_ALPHA_SATURATE;
  FUNC_ADD = this.gl.FUNC_ADD;
  BLEND_EQUATION = this.gl.BLEND_EQUATION;
  BLEND_EQUATION_RGB = this.gl.BLEND_EQUATION_RGB;
  BLEND_EQUATION_ALPHA = this.gl.BLEND_EQUATION_ALPHA;
  FUNC_SUBTRACT = this.gl.FUNC_SUBTRACT;
  FUNC_REVERSE_SUBTRACT = this.gl.FUNC_REVERSE_SUBTRACT;
  BLEND_DST_RGB = this.gl.BLEND_DST_RGB;
  BLEND_SRC_RGB = this.gl.BLEND_SRC_RGB;
  BLEND_DST_ALPHA = this.gl.BLEND_DST_ALPHA;
  BLEND_SRC_ALPHA = this.gl.BLEND_SRC_ALPHA;
  CONSTANT_COLOR = this.gl.CONSTANT_COLOR;
  ONE_MINUS_CONSTANT_COLOR = this.gl.ONE_MINUS_CONSTANT_COLOR;
  CONSTANT_ALPHA = this.gl.CONSTANT_ALPHA;
  ONE_MINUS_CONSTANT_ALPHA = this.gl.ONE_MINUS_CONSTANT_ALPHA;
  BLEND_COLOR = this.gl.BLEND_COLOR;
  ARRAY_BUFFER = this.gl.ARRAY_BUFFER;
  ELEMENT_ARRAY_BUFFER = this.gl.ELEMENT_ARRAY_BUFFER;
  ARRAY_BUFFER_BINDING = this.gl.ARRAY_BUFFER_BINDING;
  ELEMENT_ARRAY_BUFFER_BINDING = this.gl.ELEMENT_ARRAY_BUFFER_BINDING;
  STREAM_DRAW = this.gl.STREAM_DRAW;
  STATIC_DRAW = this.gl.STATIC_DRAW;
  DYNAMIC_DRAW = this.gl.DYNAMIC_DRAW;
  BUFFER_SIZE = this.gl.BUFFER_SIZE;
  BUFFER_USAGE = this.gl.BUFFER_USAGE;
  CURRENT_VERTEX_ATTRIB = this.gl.CURRENT_VERTEX_ATTRIB;
  FRONT = this.gl.FRONT;
  BACK = this.gl.BACK;
  FRONT_AND_BACK = this.gl.FRONT_AND_BACK;
  CULL_FACE = this.gl.CULL_FACE;
  BLEND = this.gl.BLEND;
  DITHER = this.gl.DITHER;
  STENCIL_TEST = this.gl.STENCIL_TEST;
  DEPTH_TEST = this.gl.DEPTH_TEST;
  SCISSOR_TEST = this.gl.SCISSOR_TEST;
  POLYGON_OFFSET_FILL = this.gl.POLYGON_OFFSET_FILL;
  SAMPLE_ALPHA_TO_COVERAGE = this.gl.SAMPLE_ALPHA_TO_COVERAGE;
  SAMPLE_COVERAGE = this.gl.SAMPLE_COVERAGE;
  NO_ERROR = this.gl.NO_ERROR;
  INVALID_ENUM = this.gl.INVALID_ENUM;
  INVALID_VALUE = this.gl.INVALID_VALUE;
  INVALID_OPERATION = this.gl.INVALID_OPERATION;
  OUT_OF_MEMORY = this.gl.OUT_OF_MEMORY;
  CW = this.gl.CW;
  CCW = this.gl.CCW;
  LINE_WIDTH = this.gl.LINE_WIDTH;
  ALIASED_POINT_SIZE_RANGE = this.gl.ALIASED_POINT_SIZE_RANGE;
  ALIASED_LINE_WIDTH_RANGE = this.gl.ALIASED_LINE_WIDTH_RANGE;
  CULL_FACE_MODE = this.gl.CULL_FACE_MODE;
  FRONT_FACE = this.gl.FRONT_FACE;
  DEPTH_RANGE = this.gl.DEPTH_RANGE;
  DEPTH_WRITEMASK = this.gl.DEPTH_WRITEMASK;
  DEPTH_CLEAR_VALUE = this.gl.DEPTH_CLEAR_VALUE;
  DEPTH_FUNC = this.gl.DEPTH_FUNC;
  STENCIL_CLEAR_VALUE = this.gl.STENCIL_CLEAR_VALUE;
  STENCIL_FUNC = this.gl.STENCIL_FUNC;
  STENCIL_FAIL = this.gl.STENCIL_FAIL;
  STENCIL_PASS_DEPTH_FAIL = this.gl.STENCIL_PASS_DEPTH_FAIL;
  STENCIL_PASS_DEPTH_PASS = this.gl.STENCIL_PASS_DEPTH_PASS;
  STENCIL_REF = this.gl.STENCIL_REF;
  STENCIL_VALUE_MASK = this.gl.STENCIL_VALUE_MASK;
  STENCIL_WRITEMASK = this.gl.STENCIL_WRITEMASK;
  STENCIL_BACK_FUNC = this.gl.STENCIL_BACK_FUNC;
  STENCIL_BACK_FAIL = this.gl.STENCIL_BACK_FAIL;
  STENCIL_BACK_PASS_DEPTH_FAIL = this.gl.STENCIL_BACK_PASS_DEPTH_FAIL;
  STENCIL_BACK_PASS_DEPTH_PASS = this.gl.STENCIL_BACK_PASS_DEPTH_PASS;
  STENCIL_BACK_REF = this.gl.STENCIL_BACK_REF;
  STENCIL_BACK_VALUE_MASK = this.gl.STENCIL_BACK_VALUE_MASK;
  STENCIL_BACK_WRITEMASK = this.gl.STENCIL_BACK_WRITEMASK;
  VIEWPORT = this.gl.VIEWPORT;
  SCISSOR_BOX = this.gl.SCISSOR_BOX;
  COLOR_CLEAR_VALUE = this.gl.COLOR_CLEAR_VALUE;
  COLOR_WRITEMASK = this.gl.COLOR_WRITEMASK;
  UNPACK_ALIGNMENT = this.gl.UNPACK_ALIGNMENT;
  PACK_ALIGNMENT = this.gl.PACK_ALIGNMENT;
  MAX_TEXTURE_SIZE = this.gl.MAX_TEXTURE_SIZE;
  MAX_VIEWPORT_DIMS = this.gl.MAX_VIEWPORT_DIMS;
  SUBPIXEL_BITS = this.gl.SUBPIXEL_BITS;
  RED_BITS = this.gl.RED_BITS;
  GREEN_BITS = this.gl.GREEN_BITS;
  BLUE_BITS = this.gl.BLUE_BITS;
  ALPHA_BITS = this.gl.ALPHA_BITS;
  DEPTH_BITS = this.gl.DEPTH_BITS;
  STENCIL_BITS = this.gl.STENCIL_BITS;
  POLYGON_OFFSET_UNITS = this.gl.POLYGON_OFFSET_UNITS;
  POLYGON_OFFSET_FACTOR = this.gl.POLYGON_OFFSET_FACTOR;
  TEXTURE_BINDING_2D = this.gl.TEXTURE_BINDING_2D;
  SAMPLE_BUFFERS = this.gl.SAMPLE_BUFFERS;
  SAMPLES = this.gl.SAMPLES;
  SAMPLE_COVERAGE_VALUE = this.gl.SAMPLE_COVERAGE_VALUE;
  SAMPLE_COVERAGE_INVERT = this.gl.SAMPLE_COVERAGE_INVERT;
  COMPRESSED_TEXTURE_FORMATS = this.gl.COMPRESSED_TEXTURE_FORMATS;
  DONT_CARE = this.gl.DONT_CARE;
  FASTEST = this.gl.FASTEST;
  NICEST = this.gl.NICEST;
  GENERATE_MIPMAP_HINT = this.gl.GENERATE_MIPMAP_HINT;
  BYTE = this.gl.BYTE;
  UNSIGNED_BYTE = this.gl.UNSIGNED_BYTE;
  SHORT = this.gl.SHORT;
  UNSIGNED_SHORT = this.gl.UNSIGNED_SHORT;
  INT = this.gl.INT;
  UNSIGNED_INT = this.gl.UNSIGNED_INT;
  FLOAT = this.gl.FLOAT;
  DEPTH_COMPONENT = this.gl.DEPTH_COMPONENT;
  ALPHA = this.gl.ALPHA;
  RGB = this.gl.RGB;
  RGBA = this.gl.RGBA;
  LUMINANCE = this.gl.LUMINANCE;
  LUMINANCE_ALPHA = this.gl.LUMINANCE_ALPHA;
  UNSIGNED_SHORT_4_4_4_4 = this.gl.UNSIGNED_SHORT_4_4_4_4;
  UNSIGNED_SHORT_5_5_5_1 = this.gl.UNSIGNED_SHORT_5_5_5_1;
  UNSIGNED_SHORT_5_6_5 = this.gl.UNSIGNED_SHORT_5_6_5;
  FRAGMENT_SHADER = this.gl.FRAGMENT_SHADER;
  VERTEX_SHADER = this.gl.VERTEX_SHADER;
  MAX_VERTEX_ATTRIBS = this.gl.MAX_VERTEX_ATTRIBS;
  MAX_VERTEX_UNIFORM_VECTORS = this.gl.MAX_VERTEX_UNIFORM_VECTORS;
  MAX_VARYING_VECTORS = this.gl.MAX_VARYING_VECTORS;
  MAX_COMBINED_TEXTURE_IMAGE_UNITS = this.gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS;
  MAX_VERTEX_TEXTURE_IMAGE_UNITS = this.gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS;
  MAX_TEXTURE_IMAGE_UNITS = this.gl.MAX_TEXTURE_IMAGE_UNITS;
  MAX_FRAGMENT_UNIFORM_VECTORS = this.gl.MAX_FRAGMENT_UNIFORM_VECTORS;
  SHADER_TYPE = this.gl.SHADER_TYPE;
  DELETE_STATUS = this.gl.DELETE_STATUS;
  LINK_STATUS = this.gl.LINK_STATUS;
  VALIDATE_STATUS = this.gl.VALIDATE_STATUS;
  ATTACHED_SHADERS = this.gl.ATTACHED_SHADERS;
  ACTIVE_UNIFORMS = this.gl.ACTIVE_UNIFORMS;
  ACTIVE_ATTRIBUTES = this.gl.ACTIVE_ATTRIBUTES;
  SHADING_LANGUAGE_VERSION = this.gl.SHADING_LANGUAGE_VERSION;
  CURRENT_PROGRAM = this.gl.CURRENT_PROGRAM;
  NEVER = this.gl.NEVER;
  LESS = this.gl.LESS;
  EQUAL = this.gl.EQUAL;
  LEQUAL = this.gl.LEQUAL;
  GREATER = this.gl.GREATER;
  NOTEQUAL = this.gl.NOTEQUAL;
  GEQUAL = this.gl.GEQUAL;
  ALWAYS = this.gl.ALWAYS;
  KEEP = this.gl.KEEP;
  REPLACE = this.gl.REPLACE;
  INCR = this.gl.INCR;
  DECR = this.gl.DECR;
  INVERT = this.gl.INVERT;
  INCR_WRAP = this.gl.INCR_WRAP;
  DECR_WRAP = this.gl.DECR_WRAP;
  VENDOR = this.gl.VENDOR;
  RENDERER = this.gl.RENDERER;
  VERSION = this.gl.VERSION;
  NEAREST = this.gl.NEAREST;
  LINEAR = this.gl.LINEAR;
  NEAREST_MIPMAP_NEAREST = this.gl.NEAREST_MIPMAP_NEAREST;
  LINEAR_MIPMAP_NEAREST = this.gl.LINEAR_MIPMAP_NEAREST;
  NEAREST_MIPMAP_LINEAR = this.gl.NEAREST_MIPMAP_LINEAR;
  LINEAR_MIPMAP_LINEAR = this.gl.LINEAR_MIPMAP_LINEAR;
  TEXTURE_MAG_FILTER = this.gl.TEXTURE_MAG_FILTER;
  TEXTURE_MIN_FILTER = this.gl.TEXTURE_MIN_FILTER;
  TEXTURE_WRAP_S = this.gl.TEXTURE_WRAP_S;
  TEXTURE_WRAP_T = this.gl.TEXTURE_WRAP_T;
  TEXTURE_2D = this.gl.TEXTURE_2D;
  TEXTURE = this.gl.TEXTURE;
  TEXTURE_CUBE_MAP = this.gl.TEXTURE_CUBE_MAP;
  TEXTURE_BINDING_CUBE_MAP = this.gl.TEXTURE_BINDING_CUBE_MAP;
  TEXTURE_CUBE_MAP_POSITIVE_X = this.gl.TEXTURE_CUBE_MAP_POSITIVE_X;
  TEXTURE_CUBE_MAP_NEGATIVE_X = this.gl.TEXTURE_CUBE_MAP_NEGATIVE_X;
  TEXTURE_CUBE_MAP_POSITIVE_Y = this.gl.TEXTURE_CUBE_MAP_POSITIVE_Y;
  TEXTURE_CUBE_MAP_NEGATIVE_Y = this.gl.TEXTURE_CUBE_MAP_NEGATIVE_Y;
  TEXTURE_CUBE_MAP_POSITIVE_Z = this.gl.TEXTURE_CUBE_MAP_POSITIVE_Z;
  TEXTURE_CUBE_MAP_NEGATIVE_Z = this.gl.TEXTURE_CUBE_MAP_NEGATIVE_Z;
  MAX_CUBE_MAP_TEXTURE_SIZE = this.gl.MAX_CUBE_MAP_TEXTURE_SIZE;
  TEXTURE0 = this.gl.TEXTURE0;
  TEXTURE1 = this.gl.TEXTURE1;
  TEXTURE2 = this.gl.TEXTURE2;
  TEXTURE3 = this.gl.TEXTURE3;
  TEXTURE4 = this.gl.TEXTURE4;
  TEXTURE5 = this.gl.TEXTURE5;
  TEXTURE6 = this.gl.TEXTURE6;
  TEXTURE7 = this.gl.TEXTURE7;
  TEXTURE8 = this.gl.TEXTURE8;
  TEXTURE9 = this.gl.TEXTURE9;
  TEXTURE10 = this.gl.TEXTURE10;
  TEXTURE11 = this.gl.TEXTURE11;
  TEXTURE12 = this.gl.TEXTURE12;
  TEXTURE13 = this.gl.TEXTURE13;
  TEXTURE14 = this.gl.TEXTURE14;
  TEXTURE15 = this.gl.TEXTURE15;
  TEXTURE16 = this.gl.TEXTURE16;
  TEXTURE17 = this.gl.TEXTURE17;
  TEXTURE18 = this.gl.TEXTURE18;
  TEXTURE19 = this.gl.TEXTURE19;
  TEXTURE20 = this.gl.TEXTURE20;
  TEXTURE21 = this.gl.TEXTURE21;
  TEXTURE22 = this.gl.TEXTURE22;
  TEXTURE23 = this.gl.TEXTURE23;
  TEXTURE24 = this.gl.TEXTURE24;
  TEXTURE25 = this.gl.TEXTURE25;
  TEXTURE26 = this.gl.TEXTURE26;
  TEXTURE27 = this.gl.TEXTURE27;
  TEXTURE28 = this.gl.TEXTURE28;
  TEXTURE29 = this.gl.TEXTURE29;
  TEXTURE30 = this.gl.TEXTURE30;
  TEXTURE31 = this.gl.TEXTURE31;
  ACTIVE_TEXTURE = this.gl.ACTIVE_TEXTURE;
  REPEAT = this.gl.REPEAT;
  CLAMP_TO_EDGE = this.gl.CLAMP_TO_EDGE;
  MIRRORED_REPEAT = this.gl.MIRRORED_REPEAT;
  FLOAT_VEC2 = this.gl.FLOAT_VEC2;
  FLOAT_VEC3 = this.gl.FLOAT_VEC3;
  FLOAT_VEC4 = this.gl.FLOAT_VEC4;
  INT_VEC2 = this.gl.INT_VEC2;
  INT_VEC3 = this.gl.INT_VEC3;
  INT_VEC4 = this.gl.INT_VEC4;
  BOOL = this.gl.BOOL;
  BOOL_VEC2 = this.gl.BOOL_VEC2;
  BOOL_VEC3 = this.gl.BOOL_VEC3;
  BOOL_VEC4 = this.gl.BOOL_VEC4;
  FLOAT_MAT2 = this.gl.FLOAT_MAT2;
  FLOAT_MAT3 = this.gl.FLOAT_MAT3;
  FLOAT_MAT4 = this.gl.FLOAT_MAT4;
  SAMPLER_2D = this.gl.SAMPLER_2D;
  SAMPLER_CUBE = this.gl.SAMPLER_CUBE;
  VERTEX_ATTRIB_ARRAY_ENABLED = this.gl.VERTEX_ATTRIB_ARRAY_ENABLED;
  VERTEX_ATTRIB_ARRAY_SIZE = this.gl.VERTEX_ATTRIB_ARRAY_SIZE;
  VERTEX_ATTRIB_ARRAY_STRIDE = this.gl.VERTEX_ATTRIB_ARRAY_STRIDE;
  VERTEX_ATTRIB_ARRAY_TYPE = this.gl.VERTEX_ATTRIB_ARRAY_TYPE;
  VERTEX_ATTRIB_ARRAY_NORMALIZED = this.gl.VERTEX_ATTRIB_ARRAY_NORMALIZED;
  VERTEX_ATTRIB_ARRAY_POINTER = this.gl.VERTEX_ATTRIB_ARRAY_POINTER;
  VERTEX_ATTRIB_ARRAY_BUFFER_BINDING = this.gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING;
  IMPLEMENTATION_COLOR_READ_TYPE = this.gl.IMPLEMENTATION_COLOR_READ_TYPE;
  IMPLEMENTATION_COLOR_READ_FORMAT = this.gl.IMPLEMENTATION_COLOR_READ_FORMAT;
  COMPILE_STATUS = this.gl.COMPILE_STATUS;
  LOW_FLOAT = this.gl.LOW_FLOAT;
  MEDIUM_FLOAT = this.gl.MEDIUM_FLOAT;
  HIGH_FLOAT = this.gl.HIGH_FLOAT;
  LOW_INT = this.gl.LOW_INT;
  MEDIUM_INT = this.gl.MEDIUM_INT;
  HIGH_INT = this.gl.HIGH_INT;
  FRAMEBUFFER = this.gl.FRAMEBUFFER;
  RENDERBUFFER = this.gl.RENDERBUFFER;
  RGBA4 = this.gl.RGBA4;
  RGB5_A1 = this.gl.RGB5_A1;
  RGB565 = this.gl.RGB565;
  DEPTH_COMPONENT16 = this.gl.DEPTH_COMPONENT16;
  STENCIL_INDEX8 = this.gl.STENCIL_INDEX8;
  DEPTH_STENCIL = this.gl.DEPTH_STENCIL;
  RENDERBUFFER_WIDTH = this.gl.RENDERBUFFER_WIDTH;
  RENDERBUFFER_HEIGHT = this.gl.RENDERBUFFER_HEIGHT;
  RENDERBUFFER_INTERNAL_FORMAT = this.gl.RENDERBUFFER_INTERNAL_FORMAT;
  RENDERBUFFER_RED_SIZE = this.gl.RENDERBUFFER_RED_SIZE;
  RENDERBUFFER_GREEN_SIZE = this.gl.RENDERBUFFER_GREEN_SIZE;
  RENDERBUFFER_BLUE_SIZE = this.gl.RENDERBUFFER_BLUE_SIZE;
  RENDERBUFFER_ALPHA_SIZE = this.gl.RENDERBUFFER_ALPHA_SIZE;
  RENDERBUFFER_DEPTH_SIZE = this.gl.RENDERBUFFER_DEPTH_SIZE;
  RENDERBUFFER_STENCIL_SIZE = this.gl.RENDERBUFFER_STENCIL_SIZE;
  FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE = this.gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE;
  FRAMEBUFFER_ATTACHMENT_OBJECT_NAME = this.gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME;
  FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL = this.gl.FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL;
  FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE = this.gl.FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE;
  COLOR_ATTACHMENT0 = this.gl.COLOR_ATTACHMENT0;
  DEPTH_ATTACHMENT = this.gl.DEPTH_ATTACHMENT;
  STENCIL_ATTACHMENT = this.gl.STENCIL_ATTACHMENT;
  DEPTH_STENCIL_ATTACHMENT = this.gl.DEPTH_STENCIL_ATTACHMENT;
  NONE = this.gl.NONE;
  FRAMEBUFFER_COMPLETE = this.gl.FRAMEBUFFER_COMPLETE;
  FRAMEBUFFER_INCOMPLETE_ATTACHMENT = this.gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
  FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT = this.gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT;
  FRAMEBUFFER_INCOMPLETE_DIMENSIONS = this.gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS;
  FRAMEBUFFER_UNSUPPORTED = this.gl.FRAMEBUFFER_UNSUPPORTED;
  FRAMEBUFFER_BINDING = this.gl.FRAMEBUFFER_BINDING;
  RENDERBUFFER_BINDING = this.gl.RENDERBUFFER_BINDING;
  MAX_RENDERBUFFER_SIZE = this.gl.MAX_RENDERBUFFER_SIZE;
  INVALID_FRAMEBUFFER_OPERATION = this.gl.INVALID_FRAMEBUFFER_OPERATION;
  UNPACK_FLIP_Y_WEBGL = this.gl.UNPACK_FLIP_Y_WEBGL;
  UNPACK_PREMULTIPLY_ALPHA_WEBGL = this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL;
  CONTEXT_LOST_WEBGL = this.gl.CONTEXT_LOST_WEBGL;
  UNPACK_COLORSPACE_CONVERSION_WEBGL = this.gl.UNPACK_COLORSPACE_CONVERSION_WEBGL;
  BROWSER_DEFAULT_WEBGL = this.gl.BROWSER_DEFAULT_WEBGL;
  makeXRCompatible(): Promise<void>;
  makeXRCompatible(): Promise<void>;
  makeXRCompatible(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  createShader(type: GL_SHADER_TYPE): WebGLShader | null {
    const shader = this.gl.createShader(type);

    if (shader) {
      this.state.shaders.set(shader, {
        source: undefined,
        state: { COMPILE_STATUSE: false }
      });
    }

    return shader;
  }

  shaderSource(shader: WebGLShader, source: string): void {
    const shaderState = this.state.shaders.get(shader);
    if (shaderState) {
      shaderState.source = source;
    }

    return this.gl.shaderSource(shader, source);
  }

  compileShader(shader: WebGLShader): void {
    this.gl.compileShader(shader);

    if (!this.getShaderParameter(shader, GL_STATIC_VARIABLES.COMPILE_STATUS)) {
      throw new Error(this.getShaderInfoLog(shader) as any);
    }

    const shaderState = this.state.shaders.get(shader);

    if (shaderState) {
      shaderState.state.COMPILE_STATUSE = true;
    }

    return;
  }

  deleteShader(shader: WebGLShader | null): void {
    if (!(shader && this.state.shaders.has(shader))) {
      throw new Error('No such shader was found');
    }

    this.state.shaders.delete(shader);

    return this.gl.deleteShader(shader);
  }

  getShaderInfoLog(shader: WebGLShader): string | null {
    return this.gl.getShaderInfoLog(shader);
  }

  getShaderParameter(shader: WebGLShader, pname: GLenum) {
    return this.gl.getShaderParameter;
  }

  createProgram(): WebGLProgram | null {
    const program = this.gl.createProgram();

    if (program) {
      this.state.programs.set(program, new WebGLProgramState());
    }

    return program;
  }

  attachShader(program: WebGLProgram, shader: WebGLShader): void {
    const programState = this.state.programs.get(program);
    if (!programState) {
      throw new Error('No such program was found');
    }

    const shaderState = this.state.shaders.get(shader);
    if (!shaderState) {
      throw new Error('No such shader was found');
    }

    this.gl.attachShader(program, shader);

    programState.attached_shaders.set(shader, shaderState);

    return;
  }

  linkProgram(program: WebGLProgram): void {
    const programState = this.state.programs.get(program);

    if (!programState) {
      throw new Error('No such program was found');
    }

    this.gl.linkProgram(program);

    const numAttribs = this.gl.getProgramParameter(program, GL_STATIC_VARIABLES.ACTIVE_ATTRIBUTES);

    for (let i = 0; i < numAttribs; i++) {
      const attrib = this.gl.getActiveAttrib(program, i)!;
      const attributeState: WebGLAttributeState = {
        name: attrib?.name,
        type: attrib?.type,
        location: this.gl.getAttribLocation(program, attrib.name)
      };

      programState.attribute_info.push(attributeState);
    }

    const numUniforms = this.gl.getProgramParameter(program, GL_STATIC_VARIABLES.ACTIVE_UNIFORMS);

    for (let i = 0; i < numUniforms; i++) {
      const uniform = this.gl.getActiveUniform(program, i)!;
      const location = this.gl.getUniformLocation(program, uniform.name)!;
      const name = uniform.name;
      const uniformState: WebGLUniformState = {
        name,
        type: uniform.type,
        value: uniform.type,
        size: uniform.size,
        location
      };

      programState.uniforms.push(uniformState);
      programState.uniforms_by_location.set(location, uniformState);
      programState.uniforms_by_name[name] = uniformState;
    }

    programState.state.LINK_STATUS = true;

    return;
  }

  // prettier-ignore
  transformFeedbackVaryings(program: WebGLProgram, varyings: Iterable<string>, bufferMode: GLenum): void {
    this.gl.transformFeedbackVaryings(program, varyings, bufferMode);
  }

  getProgramParameter(program: WebGLProgram, pname: GLenum): any {
    return this.gl.getProgramParameter(program, pname);
  }

  getProgramInfoLog(program: WebGLProgram): string | null {
    return this.gl.getProgramInfoLog(program);
  }

  deleteProgram(program: WebGLProgram | null): void {
    if (!(program && this.state.programs.has(program))) {
      throw new Error('No such program was found');
    }

    return this.gl.deleteProgram(program);
  }

  detachShader(program: WebGLProgram, shader: WebGLShader): void {
    const programState = this.state.programs.get(program);
    if (!programState) {
      throw new Error(`No such program was found`);
    }

    if (!programState.attached_shaders.has(shader)) {
      throw new Error(`No such shader was found`);
    }

    programState.attached_shaders.delete(shader);

    return this.gl.detachShader(program, shader);
  }

  validateProgram(program: WebGLProgram): void {
    return this.gl.validateProgram(program);
  }

  getAttribLocation(program: WebGLProgram, name: string): GLint {
    const programState = this.state.programs.get(program);
    if (!programState) {
      throw new Error('No such program was found');
    }

    const attribute = programState.attribute_info.find((attribute) => attribute.name === name);
    if (!attribute) {
      throw new Error('No such attribute was found');
    }

    return this.gl.getAttribLocation(program, name);
  }

  // prettier-ignore
  getUniformLocation(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    const programState = this.state.programs.get(program);
    if (!programState) {
      throw new Error("No such program was found");
    }

    const uniform = programState.uniforms_by_name[name];
    if (!uniform) {
      console.log(programState);
      debugger;
      throw new Error("No such uniform was found");
    }

    return this.gl.getUniformLocation(program, name);
  }

  uniform1f(location: WebGLUniformLocation | null, x: GLfloat): void {
    return this.gl.uniform1f(location, x);
  }

  uniform2fv(location: WebGLUniformLocation | null, v: Float32List): void {
    return this.gl.uniform2fv(location, v);
  }

  // prettier-ignore
  uniform3fv(location: WebGLUniformLocation | null, data: Float32List, srcOffset?: GLuint, srcLength?: GLuint): void {
    return this.gl.uniform3fv(location, data, srcOffset, srcLength);
  }

  uniform4fv(location: WebGLUniformLocation | null, v: Float32List): void {
    return this.gl.uniform4fv(location, v);
  }

  uniform1i(location: WebGLUniformLocation | null, x: GLint): void {
    return this.gl.uniform1i(location, x);
  }

  // prettier-ignore
  uniform2iv(location: WebGLUniformLocation | null, data: Iterable<GLint>, srcOffset?: GLuint, srcLength?: GLuint): void {
    return this.gl.uniform2iv(location, data, srcOffset, srcLength);
  }

  // prettier-ignore
  uniform3iv(location: WebGLUniformLocation | null, data: Iterable<GLint>, srcOffset?: GLuint, srcLength?: GLuint): void {
    return this.gl.uniform3iv(location, data, srcOffset, srcLength);
  }

  // prettier-ignore
  uniform4iv(location: WebGLUniformLocation | null, data: Iterable<GLint>, srcOffset?: GLuint, srcLength?: GLuint): void {
    return this.gl.uniform4iv(location, data, srcOffset, srcLength);
  }

  // prettier-ignore
  uniformMatrix2fv(location: WebGLUniformLocation | null, transpose: GLboolean, data: Iterable<GLfloat>, srcOffset?: GLuint, srcLength?: GLuint): void {
    return this.gl.uniformMatrix2fv(
      location,
      transpose,
      data,
      srcOffset,
      srcLength
    );
  }

  // prettier-ignore
  uniformMatrix3fv(location: WebGLUniformLocation | null, transpose: GLboolean, data: Iterable<GLfloat>, srcOffset?: GLuint, srcLength?: GLuint): void {
    return this.gl.uniformMatrix3fv(
      location,
      transpose,
      data,
      srcOffset,
      srcLength
    );
  }

  // prettier-ignore
  uniformMatrix4fv(location: WebGLUniformLocation | null, transpose: GLboolean, data: Iterable<GLfloat>, srcOffset?: GLuint, srcLength?: GLuint): void {
    return this.gl.uniformMatrix4fv(
      location,
      transpose,
      data,
      srcOffset,
      srcLength
    );
  }

  useProgram(program: WebGLProgram | null): void {
    if (program) {
      const programState = this.state.programs.get(program);
      if (programState) {
        this.state.globalState.commonState.CURRENT_PROGRAM = programState;
      } else {
        throw new Error('No such program was found');
      }
    } else {
      this.state.globalState.commonState.CURRENT_PROGRAM = null;
    }

    return this.gl.useProgram(program);
  }

  createVertexArray(): WebGLVertexArrayObject | null {
    const vertexArrayObject = this.gl.createVertexArray();

    if (vertexArrayObject) {
      this.state.vertexArrayObjects.set(vertexArrayObject, {
        attributes: [],
        state: { ELEMENT_ARRAY_BUFFER_BINDING: null }
      });
    }

    return vertexArrayObject;
  }

  bindVertexArray(array: WebGLVertexArrayObject | null): void {
    if (array) {
      const vertexArrayObjectState = this.state.vertexArrayObjects.get(array);
      if (vertexArrayObjectState) {
        this.state.globalState.commonState.VERTEX_ARRAY_BINDING = vertexArrayObjectState;
      } else {
        throw new Error('No such Vertex Array Object was found');
      }
    } else {
      this.state.globalState.commonState.VERTEX_ARRAY_BINDING = this.defaultVertexArrayObject;
    }

    return this.gl.bindVertexArray(array);
  }

  bindBuffer(target: number, buffer: WebGLBuffer | null): void {
    if (buffer) {
      const bufferState = this.state.buffers.get(buffer);
      if (bufferState) {
        this.state.globalState.commonState.ARRAY_BUFFER_BINDING = bufferState;
      } else {
        throw new Error('No such buffer was found');
      }
    } else {
      this.state.globalState.commonState.ARRAY_BUFFER_BINDING = null;
    }

    return this.gl.bindBuffer(target, buffer);
  }

  bufferData(target: GLenum, size: GLsizeiptr, usage: GLenum): void;
  bufferData(target: GLenum, srcData: BufferSource | null, usage: GLenum): void;
  // prettier-ignore
  bufferData(target: GLenum, srcData: ArrayBufferView, usage: GLenum, srcOffset: GLuint, length?: GLuint): void;
  // prettier-ignore
  bufferData(target: GLenum, srcData: any, usage: any, srcOffset?: any, length?: any) {
    const bufferState =
      this.state.globalState.commonState.ARRAY_BUFFER_BINDING;
    if (!bufferState) {
      throw new Error("No buffer binded");
    }

    bufferState.data = srcData;

    return this.gl.bufferData(target, srcData, usage, srcOffset, length);
  }

  enableVertexAttribArray(index: GLuint): void {
    return this.gl.enableVertexAttribArray(index);
  }

  // prettier-ignore
  vertexAttribPointer(index: GLuint, size: GLint, type: GLenum, normalized: GLboolean, stride: GLsizei, offset: GLintptr): void {
    return this.gl.vertexAttribPointer(
      index,
      size,
      type,
      normalized,
      stride,
      offset
    );
  }

  vertexAttribDivisor(index: GLuint, divisor: GLuint): void {
    return this.gl.vertexAttribDivisor(index, divisor);
  }

  createBuffer(): WebGLBuffer | null {
    const buffer = this.gl.createBuffer();

    if (buffer) {
      this.state.buffers.set(buffer, {
        data: []
      });
    }

    return buffer;
  }

  enable(cap: GLenum): void {
    return this.gl.enable(cap);
  }

  blendFunc(sfactor: GLenum, dfactor: GLenum): void {
    return this.gl.blendFunc(sfactor, dfactor);
  }

  activeTexture(texture: GLenum): void {
    return this.gl.activeTexture(texture);
  }

  bindTexture(target: GLenum, texture: WebGLTexture | null): void {
    return this.gl.bindTexture(target, texture);
  }

  // getExtension(extensionName: 'ANGLE_instanced_arrays'): ANGLE_instanced_arrays | null;
  // getExtension(extensionName: 'EXT_blend_minmax'): EXT_blend_minmax | null;
  // getExtension(extensionName: 'EXT_color_buffer_float'): EXT_color_buffer_float | null;
  // getExtension(extensionName: 'EXT_color_buffer_half_float'): EXT_color_buffer_half_float | null;
  // getExtension(extensionName: 'EXT_float_blend'): EXT_float_blend | null;
  // getExtension(extensionName: 'EXT_frag_depth'): EXT_frag_depth | null;
  // getExtension(extensionName: 'EXT_sRGB'): EXT_sRGB | null;
  // getExtension(extensionName: 'EXT_shader_texture_lod'): EXT_shader_texture_lod | null;
  // getExtension(extensionName: 'EXT_texture_compression_bptc'): EXT_texture_compression_bptc | null;
  // getExtension(extensionName: 'EXT_texture_compression_rgtc'): EXT_texture_compression_rgtc | null;
  // getExtension(extensionName: 'EXT_texture_filter_anisotropic'): EXT_texture_filter_anisotropic | null;
  // getExtension(extensionName: 'KHR_parallel_shader_compile'): KHR_parallel_shader_compile | null;
  // getExtension(extensionName: 'OES_element_index_uint'): OES_element_index_uint | null;
  // getExtension(extensionName: 'OES_fbo_render_mipmap'): OES_fbo_render_mipmap | null;
  // getExtension(extensionName: 'OES_standard_derivatives'): OES_standard_derivatives | null;
  // getExtension(extensionName: 'OES_texture_float'): OES_texture_float | null;
  // getExtension(extensionName: 'OES_texture_float_linear'): OES_texture_float_linear | null;
  // getExtension(extensionName: 'OES_texture_half_float'): OES_texture_half_float | null;
  // getExtension(extensionName: 'OES_texture_half_float_linear'): OES_texture_half_float_linear | null;
  // getExtension(extensionName: 'OES_vertex_array_object'): OES_vertex_array_object | null;
  // getExtension(extensionName: 'OVR_multiview2'): OVR_multiview2 | null;
  // getExtension(extensionName: 'WEBGL_color_buffer_float'): WEBGL_color_buffer_float | null;
  // getExtension(extensionName: 'WEBGL_compressed_texture_astc'): WEBGL_compressed_texture_astc | null;
  // getExtension(extensionName: 'WEBGL_compressed_texture_etc'): WEBGL_compressed_texture_etc | null;
  // getExtension(extensionName: 'WEBGL_compressed_texture_etc1'): WEBGL_compressed_texture_etc1 | null;
  // getExtension(extensionName: 'WEBGL_compressed_texture_s3tc'): WEBGL_compressed_texture_s3tc | null;
  // getExtension(extensionName: 'WEBGL_compressed_texture_s3tc_srgb'): WEBGL_compressed_texture_s3tc_srgb | null;
  // getExtension(extensionName: 'WEBGL_debug_renderer_info'): WEBGL_debug_renderer_info | null;
  // getExtension(extensionName: 'WEBGL_debug_shaders'): WEBGL_debug_shaders | null;
  // getExtension(extensionName: 'WEBGL_depth_texture'): WEBGL_depth_texture | null;
  // getExtension(extensionName: 'WEBGL_draw_buffers'): WEBGL_draw_buffers | null;
  // getExtension(extensionName: 'WEBGL_lose_context'): WEBGL_lose_context | null;
  // getExtension(extensionName: 'WEBGL_multi_draw'): WEBGL_multi_draw | null;
  // getExtension(extensionName: 'OCULUS_multiview'): OCULUS_multiview | null;
  getExtension(name: string): any {
    return this.gl.getExtension(name);
  }

  createFramebuffer(): WebGLFramebuffer | null {
    const framebuffer = this.gl.createFramebuffer();

    if (framebuffer) {
      this.state.framebuffer.set(framebuffer, {});
    }

    return framebuffer;
  }

  // prettier-ignore
  bindFramebuffer(target: GLenum, framebuffer: WebGLFramebuffer | null): void {
    if (framebuffer) {
      const framebufferState = this.state.framebuffer.get(framebuffer!);
      if (framebufferState) {
        this.state.globalState.commonState.FRAMEBUFFER_BINDING =
          framebufferState;
      } else {
        throw new Error("No such framebuffer was found");
      }
    } else {
      this.state.globalState.commonState.FRAMEBUFFER_BINDING = null;
    }

    return this.gl.bindFramebuffer(target, framebuffer);
  }

  createRenderbuffer(): WebGLRenderbuffer | null {
    const renderbuffer = this.gl.createRenderbuffer();

    if (renderbuffer) {
      this.state.renderBuffers.set(renderbuffer, {});
    }

    return renderbuffer;
  }

  // prettier-ignore
  bindRenderbuffer(target: GLenum, renderbuffer: WebGLRenderbuffer | null): void {
    return this.gl.bindRenderbuffer(target, renderbuffer);
  }

  // prettier-ignore
  renderbufferStorageMultisample(target: GLenum, samples: GLsizei, internalformat: GLenum, width: GLsizei, height: GLsizei): void {
    return this.gl.renderbufferStorageMultisample(
      target,
      samples,
      internalformat,
      width,
      height
    );
  }

  // prettier-ignore
  framebufferRenderbuffer(target: GLenum, attachment: GLenum, renderbuffertarget: GLenum, renderbuffer: WebGLRenderbuffer | null): void {
    return this.gl.framebufferRenderbuffer(
      target,
      attachment,
      renderbuffertarget,
      renderbuffer
    );
  }

  // prettier-ignore
  clearColor(red: GLclampf, green: GLclampf, blue: GLclampf, alpha: GLclampf): void {
    return this.gl.clearColor(red, green, blue, alpha);
  }

  clear(mask: GLbitfield): void {
    return this.gl.clear(mask);
  }

  // prettier-ignore
  renderbufferStorage(target: GLenum, internalformat: GLenum, width: GLsizei, height: GLsizei): void {
    return this.gl.renderbufferStorage(target, internalformat, width, height);
  }

  createTexture(): WebGLTexture | null {
    const texture = this.gl.createTexture();

    if (texture) {
      this.state.textures.set(texture, {
        mips: {},
        texturestate: {
          TEXTURE_MIN_FILTER: GL_TEXTURE_MIN_FILTER.NEAREST_MIPMAP_LINEAR,
          TEXTURE_MAG_FILTER: GL_TEXTURE_MAG_FILTER.LINEAR,
          TEXTURE_WRAP_S: GL_TEXTURE_WRAP_MODE.REPEAT,
          TEXTURE_WRAP_T: GL_TEXTURE_WRAP_MODE.REPEAT
        }
      });
    }

    return texture;
  }

  // prettier-ignore
  texImage2D(target: GLenum, level: GLint, internalformat: GLint, width: GLsizei, height: GLsizei, border: GLint, format: GLenum, type: GLenum, pixels: ArrayBufferView | null): void;
  // prettier-ignore
  texImage2D(target: GLenum, level: GLint, internalformat: GLint, format: GLenum, type: GLenum, source: TexImageSource): void;
  // prettier-ignore
  texImage2D(target: GLenum, level: GLint, internalformat: GLint, width: GLsizei, height: GLsizei, border: GLint, format: GLenum, type: GLenum, pboOffset: GLintptr): void;
  // prettier-ignore
  texImage2D(target: GLenum, level: GLint, internalformat: GLint, width: GLsizei, height: GLsizei, border: GLint, format: GLenum, type: GLenum, source: TexImageSource): void;
  // prettier-ignore
  texImage2D(target: GLenum, level: GLint, internalformat: GLint, width: GLsizei, height: GLsizei, border: GLint, format: GLenum, type: GLenum, srcData: ArrayBufferView, srcOffset: GLuint): void;
  // prettier-ignore
  texImage2D(target: GLenum, level: GLint, internalformat: GLint, width: GLsizei, height: GLsizei, border: GLint, format: GLenum, type: GLenum, pixels: ArrayBufferView | null): void;
  // prettier-ignore
  texImage2D(target: GLenum, level: GLint, internalformat: GLint, format: GLenum, type: GLenum, source: TexImageSource): void;
  // prettier-ignore
  texImage2D(target: any, level: any, internalformat: any, width: any, height: any, border: any = null, format: any = null, type: any = null, srcData: any = null, srcOffset: any = null): void {
    if (srcOffset) {
      // prettier-ignore
      return this.gl.texImage2D(target, level, internalformat, width, height, border, format, type, srcData, srcOffset);
    }

    // prettier-ignore
    return this.gl.texImage2D(target, level, internalformat, width, height, border, format, type, srcData);
  }

  // prettier-ignore
  blitFramebuffer(srcX0: GLint, srcY0: GLint, srcX1: GLint, srcY1: GLint, dstX0: GLint, dstY0: GLint, dstX1: GLint, dstY1: GLint, mask: GLbitfield, filter: GLenum): void {
    // prettier-ignore
    return this.gl.blitFramebuffer(srcX0, srcY0, srcX1, srcY1, dstX0, dstY0, dstX1, dstY1, mask, filter);
  }

  // prettier-ignore
  clearBufferfv(buffer: GLenum, drawbuffer: GLint, values: Iterable<GLfloat>, srcOffset?: GLuint): void {
    return this.gl.clearBufferfv(buffer, drawbuffer, values, srcOffset);
  }

  // prettier-ignore
  framebufferTexture2D(target: GLenum, attachment: GLenum, textarget: GLenum, texture: WebGLTexture | null, level: GLint): void {
    return this.gl.framebufferTexture2D(
      target,
      attachment,
      textarget,
      texture,
      level
    );
  }

  drawBuffers(buffers: Iterable<GLenum>): void {
    return this.gl.drawBuffers(buffers);
  }

  // prettier-ignore
  texStorage2D(target: GLenum, levels: GLsizei, internalformat: GLenum, width: GLsizei, height: GLsizei): void {
    return this.gl.texStorage2D(target, levels, internalformat, width, height);
  }

  // prettier-ignore
  texParameteri(target: GLenum, pname: GLenum, param: GLint): void {
    return this.gl.texParameteri(target, pname, param);
  }

  checkFramebufferStatus(target: GLenum): GLenum {
    return this.gl.checkFramebufferStatus(target);
  }

  // prettier-ignore
  drawElements(mode: GLenum, count: GLsizei, type: GLenum, offset: GLintptr): void {
    return this.gl.drawElements(mode, count, type, offset);
  }

  // prettier-ignore
  viewport(x: GLint, y: GLint, width: GLsizei, height: GLsizei): void {
    this.state.globalState.commonState.VIEWPORT[0] = x;
    this.state.globalState.commonState.VIEWPORT[1] = y;
    this.state.globalState.commonState.VIEWPORT[2] = width;
    this.state.globalState.commonState.VIEWPORT[3] = height;
    return this.gl.viewport(x, y, width, height);
  }
}
