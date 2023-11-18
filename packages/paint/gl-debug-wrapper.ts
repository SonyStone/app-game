import {
  GL_SHADER_TYPE,
  GL_STATIC_VARIABLES,
  GL_TEXTURES,
} from "@webgl/static-variables";
import {
  GL_TEXTURE_MAG_FILTER,
  GL_TEXTURE_MIN_FILTER,
  GL_TEXTURE_WRAP_MODE,
} from "@webgl/static-variables/textures";

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
interface WebGLProgramState {
  attached_shaders: Map<WebGLShader, WebGLShaderState>;
  attribute_info: WebGLAttributeState[];
  uniforms: WebGLUniformState[];
  uniforms_by_name: { [key: string]: WebGLUniformState };
  uniforms_by_location: Map<WebGLUniformLocation, WebGLUniformState>;
  state: {
    LINK_STATUS: boolean;
  };
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
  texture_state: {
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
  global_state: {
    common_state: CommonState;
    texture_utils: TextureUnits;
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

export class WebGL2DebugWrapper implements Partial<WebGL2RenderingContext> {
  private defaultVertexArrayObject: WebGLVertexArrayObjectState = {
    attributes: [],
    state: {
      ELEMENT_ARRAY_BUFFER_BINDING: null,
    },
  };

  _state: WebGLState = {
    global_state: {
      common_state: {
        VIEWPORT: [0, 0, 300, 150],
        ARRAY_BUFFER_BINDING: null,
        CURRENT_PROGRAM: null,
        VERTEX_ARRAY_BINDING: this.defaultVertexArrayObject,
        RENDERBUFFER_BINDING: null,
        FRAMEBUFFER_BINDING: null,
        ACTIVE_TEXTURE: "TEXTURE0",
      },
      texture_utils: {},
    },
    shaders: new Map<WebGLShader, WebGLShaderState>(),
    programs: new Map<WebGLProgram, WebGLProgramState>(),
    buffers: new Map<WebGLBuffer, WebGLBufferState>(),
    vertexArrayObjects: new Map<
      WebGLVertexArrayObject,
      WebGLVertexArrayObjectState
    >(),
    renderBuffers: new Map<WebGLRenderbuffer, WebGLRenderbufferState>(),
    framebuffer: new Map<WebGLFramebuffer, WebGLFramebufferState>(),
    textures: new Map<WebGLTexture, WebGLTextureState>(),
  };

  constructor(private readonly gl: WebGL2RenderingContext) {}

  createShader(type: GL_SHADER_TYPE): WebGLShader | null {
    const shader = this.gl.createShader(type);

    if (shader) {
      this._state.shaders.set(shader, {
        source: undefined,
        state: { COMPILE_STATUSE: false },
      });
    }

    return shader;
  }

  shaderSource(shader: WebGLShader, source: string): void {
    const shaderState = this._state.shaders.get(shader);
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

    const shaderState = this._state.shaders.get(shader);

    if (shaderState) {
      shaderState.state.COMPILE_STATUSE = true;
    }

    return;
  }

  deleteShader(shader: WebGLShader | null): void {
    if (!(shader && this._state.shaders.has(shader))) {
      throw new Error("No such shader was found");
    }

    this._state.shaders.delete(shader);

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
      this._state.programs.set(program, {
        attached_shaders: new Map(),
        attribute_info: [],
        uniforms: [],
        uniforms_by_name: {},
        uniforms_by_location: new Map(),
        state: { LINK_STATUS: false },
      });
    }

    return program;
  }

  attachShader(program: WebGLProgram, shader: WebGLShader): void {
    const programState = this._state.programs.get(program);
    if (!programState) {
      throw new Error("No such program was found");
    }

    const shaderState = this._state.shaders.get(shader);
    if (!shaderState) {
      throw new Error("No such shader was found");
    }

    this.gl.attachShader(program, shader);

    programState.attached_shaders.set(shader, shaderState);

    return;
  }

  linkProgram(program: WebGLProgram): void {
    const programState = this._state.programs.get(program);

    if (!programState) {
      throw new Error("No such program was found");
    }

    this.gl.linkProgram(program);

    const numAttribs = this.gl.getProgramParameter(
      program,
      GL_STATIC_VARIABLES.ACTIVE_ATTRIBUTES
    );

    for (let i = 0; i < numAttribs; i++) {
      const attrib = this.gl.getActiveAttrib(program, i)!;
      const attributeState: WebGLAttributeState = {
        name: attrib?.name,
        type: attrib?.type,
        location: this.gl.getAttribLocation(program, attrib.name),
      };

      programState.attribute_info.push(attributeState);
    }

    const numUniforms = this.gl.getProgramParameter(
      program,
      GL_STATIC_VARIABLES.ACTIVE_UNIFORMS
    );

    for (let i = 0; i < numUniforms; i++) {
      const uniform = this.gl.getActiveUniform(program, i)!;
      const location = this.gl.getUniformLocation(program, uniform.name)!;
      const name = uniform.name;
      const uniformState: WebGLUniformState = {
        name,
        type: uniform.type,
        value: uniform.type,
        size: uniform.size,
        location,
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
    if (!(program && this._state.programs.has(program))) {
      throw new Error("No such program was found");
    }

    return this.gl.deleteProgram(program);
  }

  detachShader(program: WebGLProgram, shader: WebGLShader): void {
    const programState = this._state.programs.get(program);
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
    const programState = this._state.programs.get(program);
    if (!programState) {
      throw new Error("No such program was found");
    }

    const attribute = programState.attribute_info.find(
      (attribute) => attribute.name === name
    );
    if (!attribute) {
      throw new Error("No such attribute was found");
    }

    return this.gl.getAttribLocation(program, name);
  }

  // prettier-ignore
  getUniformLocation(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    const programState = this._state.programs.get(program);
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
      const programState = this._state.programs.get(program);
      if (programState) {
        this._state.global_state.common_state.CURRENT_PROGRAM = programState;
      } else {
        throw new Error("No such program was found");
      }
    } else {
      this._state.global_state.common_state.CURRENT_PROGRAM = null;
    }

    return this.gl.useProgram(program);
  }

  createVertexArray(): WebGLVertexArrayObject | null {
    const vertexArrayObject = this.gl.createVertexArray();

    if (vertexArrayObject) {
      this._state.vertexArrayObjects.set(vertexArrayObject, {
        attributes: [],
        state: { ELEMENT_ARRAY_BUFFER_BINDING: null },
      });
    }

    return vertexArrayObject;
  }

  bindVertexArray(array: WebGLVertexArrayObject | null): void {
    if (array) {
      const vertexArrayObjectState = this._state.vertexArrayObjects.get(array);
      if (vertexArrayObjectState) {
        this._state.global_state.common_state.VERTEX_ARRAY_BINDING =
          vertexArrayObjectState;
      } else {
        throw new Error("No such Vertex Array Object was found");
      }
    } else {
      this._state.global_state.common_state.VERTEX_ARRAY_BINDING =
        this.defaultVertexArrayObject;
    }

    return this.gl.bindVertexArray(array);
  }

  bindBuffer(target: number, buffer: WebGLBuffer | null): void {
    if (buffer) {
      const bufferState = this._state.buffers.get(buffer);
      if (bufferState) {
        this._state.global_state.common_state.ARRAY_BUFFER_BINDING =
          bufferState;
      } else {
        throw new Error("No such buffer was found");
      }
    } else {
      this._state.global_state.common_state.ARRAY_BUFFER_BINDING = null;
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
      this._state.global_state.common_state.ARRAY_BUFFER_BINDING;
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
      this._state.buffers.set(buffer, {
        data: [],
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

  // prettier-ignore
  getExtension(extensionName: "ANGLE_instanced_arrays"): ANGLE_instanced_arrays | null;
  getExtension(extensionName: "EXT_blend_minmax"): EXT_blend_minmax | null;
  // prettier-ignore
  getExtension(extensionName: "EXT_color_buffer_float"): EXT_color_buffer_float | null;
  // prettier-ignore
  getExtension(extensionName: "EXT_color_buffer_half_float"): EXT_color_buffer_half_float | null;
  getExtension(extensionName: "EXT_float_blend"): EXT_float_blend | null;
  getExtension(extensionName: "EXT_frag_depth"): EXT_frag_depth | null;
  getExtension(extensionName: "EXT_sRGB"): EXT_sRGB | null;
  // prettier-ignore
  getExtension(extensionName: "EXT_shader_texture_lod"): EXT_shader_texture_lod | null;
  // prettier-ignore
  getExtension(extensionName: "EXT_texture_compression_bptc"): EXT_texture_compression_bptc | null;
  // prettier-ignore
  getExtension(extensionName: "EXT_texture_compression_rgtc"): EXT_texture_compression_rgtc | null;
  // prettier-ignore
  getExtension(extensionName: "EXT_texture_filter_anisotropic"): EXT_texture_filter_anisotropic | null;
  // prettier-ignore
  getExtension(extensionName: "KHR_parallel_shader_compile"): KHR_parallel_shader_compile | null;
  // prettier-ignore
  getExtension(extensionName: "OES_element_index_uint"): OES_element_index_uint | null;
  // prettier-ignore
  getExtension(extensionName: "OES_fbo_render_mipmap"): OES_fbo_render_mipmap | null;
  // prettier-ignore
  getExtension(extensionName: "OES_standard_derivatives"): OES_standard_derivatives | null;
  // prettier-ignore
  getExtension(extensionName: "OES_texture_float"): OES_texture_float | null;
  // prettier-ignore
  getExtension(extensionName: "OES_texture_float_linear"): OES_texture_float_linear | null;
  // prettier-ignore
  getExtension(extensionName: "OES_texture_half_float"): OES_texture_half_float | null;
  // prettier-ignore
  getExtension(extensionName: "OES_texture_half_float_linear"): OES_texture_half_float_linear | null;
  // prettier-ignore
  getExtension(extensionName: "OES_vertex_array_object"): OES_vertex_array_object | null;
  getExtension(extensionName: "OVR_multiview2"): OVR_multiview2 | null;
  // prettier-ignore
  getExtension(extensionName: "WEBGL_color_buffer_float"): WEBGL_color_buffer_float | null;
  // prettier-ignore
  getExtension(extensionName: "WEBGL_compressed_texture_astc"): WEBGL_compressed_texture_astc | null;
  // prettier-ignore
  getExtension(extensionName: "WEBGL_compressed_texture_etc"): WEBGL_compressed_texture_etc | null;
  // prettier-ignore
  getExtension(extensionName: "WEBGL_compressed_texture_etc1"): WEBGL_compressed_texture_etc1 | null;
  // prettier-ignore
  getExtension(extensionName: "WEBGL_compressed_texture_s3tc"): WEBGL_compressed_texture_s3tc | null;
  // prettier-ignore
  getExtension(extensionName: "WEBGL_compressed_texture_s3tc_srgb"): WEBGL_compressed_texture_s3tc_srgb | null;
  // prettier-ignore
  getExtension(extensionName: "WEBGL_debug_renderer_info"): WEBGL_debug_renderer_info | null;
  // prettier-ignore
  getExtension(extensionName: "WEBGL_debug_shaders"): WEBGL_debug_shaders | null;
  // prettier-ignore
  getExtension(extensionName: "WEBGL_depth_texture"): WEBGL_depth_texture | null;
  getExtension(extensionName: "WEBGL_draw_buffers"): WEBGL_draw_buffers | null;
  getExtension(extensionName: "WEBGL_lose_context"): WEBGL_lose_context | null;
  getExtension(extensionName: "WEBGL_multi_draw"): WEBGL_multi_draw | null;
  getExtension(extensionName: "OCULUS_multiview"): OCULUS_multiview | null;
  getExtension(name: string): any {
    return this.gl.getExtension(name);
  }

  createFramebuffer(): WebGLFramebuffer | null {
    const framebuffer = this.gl.createFramebuffer();

    if (framebuffer) {
      this._state.framebuffer.set(framebuffer, {});
    }

    return framebuffer;
  }

  // prettier-ignore
  bindFramebuffer(target: GLenum, framebuffer: WebGLFramebuffer | null): void {
    if (framebuffer) {
      const framebufferState = this._state.framebuffer.get(framebuffer!);
      if (framebufferState) {
        this._state.global_state.common_state.FRAMEBUFFER_BINDING =
          framebufferState;
      } else {
        throw new Error("No such framebuffer was found");
      }
    } else {
      this._state.global_state.common_state.FRAMEBUFFER_BINDING = null;
    }

    return this.gl.bindFramebuffer(target, framebuffer);
  }

  createRenderbuffer(): WebGLRenderbuffer | null {
    const renderbuffer = this.gl.createRenderbuffer();

    if (renderbuffer) {
      this._state.renderBuffers.set(renderbuffer, {});
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
      this._state.textures.set(texture, {
        mips: {},
        texture_state: {
          TEXTURE_MIN_FILTER: GL_TEXTURE_MIN_FILTER.NEAREST_MIPMAP_LINEAR,
          TEXTURE_MAG_FILTER: GL_TEXTURE_MAG_FILTER.LINEAR,
          TEXTURE_WRAP_S: GL_TEXTURE_WRAP_MODE.REPEAT,
          TEXTURE_WRAP_T: GL_TEXTURE_WRAP_MODE.REPEAT,
        },
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
    this._state.global_state.common_state.VIEWPORT[0] = x;
    this._state.global_state.common_state.VIEWPORT[1] = y;
    this._state.global_state.common_state.VIEWPORT[2] = width;
    this._state.global_state.common_state.VIEWPORT[3] = height;
    return this.gl.viewport(x, y, width, height);
  }
}
