import { GL_SHADER_TYPE } from '@app-game/webgl/static-variables';
import { ErrorCallback, ProgramOptions } from '.';
import * as helper from './helper';
import * as utils from './utils';

/**
 * Low level shader program related functions
 *
 * You should generally not need to use these functions. They are provided
 * for those cases where you're doing something out of the ordinary
 * and you need lower level access.
 *
 * For backward compatibility they are available at both `twgl.programs` and `twgl`
 * itself
 *
 * See {@link module:twgl} for core functions
 *
 * @module twgl/programs
 */

const error = helper.error;
const warn = helper.warn;

type ProgramGLContext = WebGLRenderingContext | WebGL2RenderingContext;
type ProgramContextLike = Parameters<typeof utils.isWebGL2>[0];
type TypedArrayConstructor = Float32ArrayConstructor | Int32ArrayConstructor | Uint32ArrayConstructor;
type UniformSetter = ((...args: any[]) => void) & {
  location?: WebGLUniformLocation;
};
type UniformValue = number | ArrayLike<number>;
type UniformSetterMap = Record<string, UniformSetter>;
type PublicUniformSetterMap = Record<string, (...args: any[]) => void>;
type UniformTree = Record<string | number, any>;
type TypeMapEntry = {
  Type: TypedArrayConstructor | null;
  size: number;
  setter: (...args: any[]) => UniformSetter;
  arraySetter?: (...args: any[]) => UniformSetter;
  rows?: number;
  cols?: number;
  bindPoint?: number;
};
type AttribValue = Float32List | Int32List | Uint32List;
type AttribInfoLike = {
  value?: AttribValue;
  buffer?: WebGLBuffer | null;
  numComponents?: number;
  size?: number;
  type?: number;
  normalize?: boolean;
  stride?: number;
  offset?: number;
  divisor?: number;
};
type AttribSetter = ((attribInfo: AttribInfoLike) => void) & {
  location?: number;
};
type AttribSetterMap = Record<string, AttribSetter>;
type PublicAttribSetterMap = Record<string, (attribInfo: AttribInfoLike) => void>;
type AttrTypeMapEntry = {
  size: number;
  setter: (...args: any[]) => AttribSetter;
  count?: number;
};
type ProgramCreationOptions = {
  errorCallback: ErrorCallback;
  callback?: (err?: string, result?: unknown) => void;
  errors: string[];
  transformFeedbackVaryings?: unknown;
  transformFeedbackMode?: number;
  attribLocations?: Record<string, number>;
};
type ProgramOptionsLike = ProgramOptions & {
  callback?: (err?: string, result?: unknown) => void;
  attribLocations?: Record<string, number> | string[];
  transformFeedbackVaryings?: unknown;
  transformFeedbackMode?: number;
  errorCallback?: ErrorCallback;
};
type ProgramOptionsArg = ProgramCreationOptions | ProgramOptionsLike | string[] | ErrorCallback | undefined;
type TextureSamplerPair = {
  texture: WebGLTexture | null;
  sampler: WebGLSampler | null;
};
type TransformFeedbackInfo = {
  index: number;
  type: number;
  size: number;
};
type TransformFeedbackInfoMap = Record<string, TransformFeedbackInfo>;
type BufferInfoLike = {
  attribs?: Record<string, AttribInfoLike>;
  indices?: WebGLBuffer | null;
  vertexArrayObject?: WebGLVertexArrayObject | null;
};
type BlockUniformData = {
  name: string;
  type: number;
  size: number;
  blockNdx: number;
  offset: number;
};
type BlockUniformNumericKey = 'type' | 'size' | 'blockNdx' | 'offset';
type BlockSpec = {
  index: number;
  usedByVertexShader: boolean | number;
  usedByFragmentShader: boolean | number;
  size: number;
  uniformIndices: number[];
  used: boolean;
};
type UniformBlockSpec = {
  blockSpecs: Record<string, BlockSpec>;
  uniformData: BlockUniformData[];
};
type UniformBlockInfo = {
  name: string;
  array: ArrayBuffer;
  asFloat: Float32Array;
  buffer: WebGLBuffer | null;
  offset?: number;
  uniforms: Record<string, ArrayBufferView>;
  setters: Record<string, (value: UniformValue) => void>;
};
type ProgramInfoLike = {
  program: WebGLProgram;
  uniformSetters?: PublicUniformSetterMap;
  attribSetters?: PublicAttribSetterMap;
  uniformBlockSpec?: UniformBlockSpec;
  transformFeedbackInfo?: TransformFeedbackInfoMap;
};
type ProgramSpecLike = string[] | (ProgramOptionsLike & { shaders: (string | WebGLShader)[] });
type ProgramSpecMap = Record<string, ProgramSpecLike>;
type SharedProgramOptions = ProgramOptionsLike | ProgramCreationOptions;

function getElementById(id: string): HTMLElement | null {
  return typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null;
}

const TEXTURE0 = 0x84c0;
const DYNAMIC_DRAW = 0x88e8;

const ARRAY_BUFFER = 0x8892;
const ELEMENT_ARRAY_BUFFER = 0x8893;
const UNIFORM_BUFFER = 0x8a11;
const TRANSFORM_FEEDBACK_BUFFER = 0x8c8e;

const TRANSFORM_FEEDBACK = 0x8e22;

const COMPILE_STATUS = 0x8b81;
const LINK_STATUS = 0x8b82;
const FRAGMENT_SHADER = 0x8b30;
const VERTEX_SHADER = 0x8b31;
const SEPARATE_ATTRIBS = 0x8c8d;

const ACTIVE_UNIFORMS = 0x8b86;
const ACTIVE_ATTRIBUTES = 0x8b89;
const TRANSFORM_FEEDBACK_VARYINGS = 0x8c83;
const ACTIVE_UNIFORM_BLOCKS = 0x8a36;
const UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER = 0x8a44;
const UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER = 0x8a46;
const UNIFORM_BLOCK_DATA_SIZE = 0x8a40;
const UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES = 0x8a43;

const FLOAT = 0x1406;
const FLOAT_VEC2 = 0x8b50;
const FLOAT_VEC3 = 0x8b51;
const FLOAT_VEC4 = 0x8b52;
const INT = 0x1404;
const INT_VEC2 = 0x8b53;
const INT_VEC3 = 0x8b54;
const INT_VEC4 = 0x8b55;
const BOOL = 0x8b56;
const BOOL_VEC2 = 0x8b57;
const BOOL_VEC3 = 0x8b58;
const BOOL_VEC4 = 0x8b59;
const FLOAT_MAT2 = 0x8b5a;
const FLOAT_MAT3 = 0x8b5b;
const FLOAT_MAT4 = 0x8b5c;
const SAMPLER_2D = 0x8b5e;
const SAMPLER_CUBE = 0x8b60;
const SAMPLER_3D = 0x8b5f;
const SAMPLER_2D_SHADOW = 0x8b62;
const FLOAT_MAT2x3 = 0x8b65;
const FLOAT_MAT2x4 = 0x8b66;
const FLOAT_MAT3x2 = 0x8b67;
const FLOAT_MAT3x4 = 0x8b68;
const FLOAT_MAT4x2 = 0x8b69;
const FLOAT_MAT4x3 = 0x8b6a;
const SAMPLER_2D_ARRAY = 0x8dc1;
const SAMPLER_2D_ARRAY_SHADOW = 0x8dc4;
const SAMPLER_CUBE_SHADOW = 0x8dc5;
const UNSIGNED_INT = 0x1405;
const UNSIGNED_INT_VEC2 = 0x8dc6;
const UNSIGNED_INT_VEC3 = 0x8dc7;
const UNSIGNED_INT_VEC4 = 0x8dc8;
const INT_SAMPLER_2D = 0x8dca;
const INT_SAMPLER_3D = 0x8dcb;
const INT_SAMPLER_CUBE = 0x8dcc;
const INT_SAMPLER_2D_ARRAY = 0x8dcf;
const UNSIGNED_INT_SAMPLER_2D = 0x8dd2;
const UNSIGNED_INT_SAMPLER_3D = 0x8dd3;
const UNSIGNED_INT_SAMPLER_CUBE = 0x8dd4;
const UNSIGNED_INT_SAMPLER_2D_ARRAY = 0x8dd7;

const TEXTURE_2D = 0x0de1;
const TEXTURE_CUBE_MAP = 0x8513;
const TEXTURE_3D = 0x806f;
const TEXTURE_2D_ARRAY = 0x8c1a;

const typeMap: Record<number, TypeMapEntry> = {};

/**
 * Returns the corresponding bind point for a given sampler type
 * @private
 */
function getBindPointForSamplerType(gl: ProgramGLContext, type: number): number {
  const typeInfo = typeMap[type];
  if (!typeInfo || typeInfo.bindPoint === undefined) {
    throw new Error('unknown sampler type');
  }
  return typeInfo.bindPoint;
}

// This kind of sucks! If you could compose functions as in `var fn = gl[name];`
// this code could be a lot smaller but that is sadly really slow (T_T)

function floatSetter(gl: ProgramGLContext, location: WebGLUniformLocation): (v: number) => void {
  return function (v: number) {
    gl.uniform1f(location, v);
  };
}

function floatArraySetter(gl: ProgramGLContext, location: WebGLUniformLocation): (v: Float32List) => void {
  return function (v: Float32List) {
    gl.uniform1fv(location, v);
  };
}

function floatVec2Setter(gl: ProgramGLContext, location: WebGLUniformLocation): (v: Float32List) => void {
  return function (v: Float32List) {
    gl.uniform2fv(location, v);
  };
}

function floatVec3Setter(gl: ProgramGLContext, location: WebGLUniformLocation): (v: Float32List) => void {
  return function (v: Float32List) {
    gl.uniform3fv(location, v);
  };
}

function floatVec4Setter(gl: ProgramGLContext, location: WebGLUniformLocation): (v: Float32List) => void {
  return function (v: Float32List) {
    gl.uniform4fv(location, v);
  };
}

function intSetter(gl: ProgramGLContext, location: WebGLUniformLocation): (v: number) => void {
  return function (v: number) {
    gl.uniform1i(location, v);
  };
}

function intArraySetter(gl: ProgramGLContext, location: WebGLUniformLocation): (v: Int32List) => void {
  return function (v: Int32List) {
    gl.uniform1iv(location, v);
  };
}

function intVec2Setter(gl: ProgramGLContext, location: WebGLUniformLocation): (v: Int32List) => void {
  return function (v: Int32List) {
    gl.uniform2iv(location, v);
  };
}

function intVec3Setter(gl: ProgramGLContext, location: WebGLUniformLocation): (v: Int32List) => void {
  return function (v: Int32List) {
    gl.uniform3iv(location, v);
  };
}

function intVec4Setter(gl: ProgramGLContext, location: WebGLUniformLocation): (v: Int32List) => void {
  return function (v: Int32List) {
    gl.uniform4iv(location, v);
  };
}

function uintSetter(gl: WebGL2RenderingContext, location: WebGLUniformLocation): (v: number) => void {
  return function (v: number) {
    gl.uniform1ui(location, v);
  };
}

function uintArraySetter(gl: WebGL2RenderingContext, location: WebGLUniformLocation): (v: Uint32List) => void {
  return function (v: Uint32List) {
    gl.uniform1uiv(location, v);
  };
}

function uintVec2Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation): (v: Uint32List) => void {
  return function (v: Uint32List) {
    gl.uniform2uiv(location, v);
  };
}

function uintVec3Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation): (v: Uint32List) => void {
  return function (v: Uint32List) {
    gl.uniform3uiv(location, v);
  };
}

function uintVec4Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation): (v: Uint32List) => void {
  return function (v: Uint32List) {
    gl.uniform4uiv(location, v);
  };
}

function floatMat2Setter(gl: ProgramGLContext, location: WebGLUniformLocation): (v: Float32List) => void {
  return function (v: Float32List) {
    gl.uniformMatrix2fv(location, false, v);
  };
}

function floatMat3Setter(gl: ProgramGLContext, location: WebGLUniformLocation): (v: Float32List) => void {
  return function (v: Float32List) {
    gl.uniformMatrix3fv(location, false, v);
  };
}

function floatMat4Setter(gl: ProgramGLContext, location: WebGLUniformLocation): (v: Float32List) => void {
  return function (v: Float32List) {
    gl.uniformMatrix4fv(location, false, v);
  };
}

function floatMat23Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation): (v: Float32List) => void {
  return function (v: Float32List) {
    gl.uniformMatrix2x3fv(location, false, v);
  };
}

function floatMat32Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation): (v: Float32List) => void {
  return function (v: Float32List) {
    gl.uniformMatrix3x2fv(location, false, v);
  };
}

function floatMat24Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation): (v: Float32List) => void {
  return function (v: Float32List) {
    gl.uniformMatrix2x4fv(location, false, v);
  };
}

function floatMat42Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation): (v: Float32List) => void {
  return function (v: Float32List) {
    gl.uniformMatrix4x2fv(location, false, v);
  };
}

function floatMat34Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation): (v: Float32List) => void {
  return function (v: Float32List) {
    gl.uniformMatrix3x4fv(location, false, v);
  };
}

function floatMat43Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation): (v: Float32List) => void {
  return function (v: Float32List) {
    gl.uniformMatrix4x3fv(location, false, v);
  };
}

function samplerSetter(gl: ProgramGLContext, type: number, unit: number, location: WebGLUniformLocation): UniformSetter {
  const bindPoint = getBindPointForSamplerType(gl, type);
  return utils.isWebGL2(gl as ProgramContextLike)
    ? function (textureOrPair: unknown) {
        const gl2 = gl as WebGL2RenderingContext;
        let texture: WebGLTexture | null;
        let sampler: WebGLSampler | null;
        if (!textureOrPair || helper.isTexture(gl2, textureOrPair)) {
          texture = textureOrPair as WebGLTexture | null;
          sampler = null;
        } else {
          const pair = textureOrPair as TextureSamplerPair;
          texture = pair.texture;
          sampler = pair.sampler;
        }
        gl2.uniform1i(location, unit);
        gl2.activeTexture(TEXTURE0 + unit);
        gl2.bindTexture(bindPoint, texture);
        gl2.bindSampler(unit, sampler);
      }
    : function (texture: WebGLTexture | null) {
        gl.uniform1i(location, unit);
        gl.activeTexture(TEXTURE0 + unit);
        gl.bindTexture(bindPoint, texture);
      };
}

function samplerArraySetter(
  gl: ProgramGLContext,
  type: number,
  unit: number,
  location: WebGLUniformLocation,
  size: number
): UniformSetter {
  const bindPoint = getBindPointForSamplerType(gl, type);
  const units = new Int32Array(size);
  for (let ii = 0; ii < size; ++ii) {
    units[ii] = unit + ii;
  }

  return utils.isWebGL2(gl as ProgramContextLike)
    ? function (textures: unknown) {
        const gl2 = gl as WebGL2RenderingContext;
        gl2.uniform1iv(location, units);
        (textures as Array<unknown>).forEach(function (textureOrPair: unknown, index: number) {
          gl2.activeTexture(TEXTURE0 + units[index]);
          let texture: WebGLTexture | null;
          let sampler: WebGLSampler | null;
          if (!textureOrPair || helper.isTexture(gl2, textureOrPair)) {
            texture = textureOrPair as WebGLTexture | null;
            sampler = null;
          } else {
            const pair = textureOrPair as TextureSamplerPair;
            texture = pair.texture;
            sampler = pair.sampler;
          }
          gl2.bindSampler(unit, sampler);
          gl2.bindTexture(bindPoint, texture);
        });
      }
    : function (textures: unknown) {
        gl.uniform1iv(location, units);
        (textures as Array<WebGLTexture | null>).forEach(function (texture: WebGLTexture | null, index: number) {
          gl.activeTexture(TEXTURE0 + units[index]);
          gl.bindTexture(bindPoint, texture);
        });
      };
}

typeMap[FLOAT] = { Type: Float32Array, size: 4, setter: floatSetter, arraySetter: floatArraySetter };
typeMap[FLOAT_VEC2] = { Type: Float32Array, size: 8, setter: floatVec2Setter, cols: 2 };
typeMap[FLOAT_VEC3] = { Type: Float32Array, size: 12, setter: floatVec3Setter, cols: 3 };
typeMap[FLOAT_VEC4] = { Type: Float32Array, size: 16, setter: floatVec4Setter, cols: 4 };
typeMap[INT] = { Type: Int32Array, size: 4, setter: intSetter, arraySetter: intArraySetter };
typeMap[INT_VEC2] = { Type: Int32Array, size: 8, setter: intVec2Setter, cols: 2 };
typeMap[INT_VEC3] = { Type: Int32Array, size: 12, setter: intVec3Setter, cols: 3 };
typeMap[INT_VEC4] = { Type: Int32Array, size: 16, setter: intVec4Setter, cols: 4 };
typeMap[UNSIGNED_INT] = { Type: Uint32Array, size: 4, setter: uintSetter, arraySetter: uintArraySetter };
typeMap[UNSIGNED_INT_VEC2] = { Type: Uint32Array, size: 8, setter: uintVec2Setter, cols: 2 };
typeMap[UNSIGNED_INT_VEC3] = { Type: Uint32Array, size: 12, setter: uintVec3Setter, cols: 3 };
typeMap[UNSIGNED_INT_VEC4] = { Type: Uint32Array, size: 16, setter: uintVec4Setter, cols: 4 };
typeMap[BOOL] = { Type: Uint32Array, size: 4, setter: intSetter, arraySetter: intArraySetter };
typeMap[BOOL_VEC2] = { Type: Uint32Array, size: 8, setter: intVec2Setter, cols: 2 };
typeMap[BOOL_VEC3] = { Type: Uint32Array, size: 12, setter: intVec3Setter, cols: 3 };
typeMap[BOOL_VEC4] = { Type: Uint32Array, size: 16, setter: intVec4Setter, cols: 4 };
typeMap[FLOAT_MAT2] = { Type: Float32Array, size: 32, setter: floatMat2Setter, rows: 2, cols: 2 };
typeMap[FLOAT_MAT3] = { Type: Float32Array, size: 48, setter: floatMat3Setter, rows: 3, cols: 3 };
typeMap[FLOAT_MAT4] = { Type: Float32Array, size: 64, setter: floatMat4Setter, rows: 4, cols: 4 };
typeMap[FLOAT_MAT2x3] = { Type: Float32Array, size: 32, setter: floatMat23Setter, rows: 2, cols: 3 };
typeMap[FLOAT_MAT2x4] = { Type: Float32Array, size: 32, setter: floatMat24Setter, rows: 2, cols: 4 };
typeMap[FLOAT_MAT3x2] = { Type: Float32Array, size: 48, setter: floatMat32Setter, rows: 3, cols: 2 };
typeMap[FLOAT_MAT3x4] = { Type: Float32Array, size: 48, setter: floatMat34Setter, rows: 3, cols: 4 };
typeMap[FLOAT_MAT4x2] = { Type: Float32Array, size: 64, setter: floatMat42Setter, rows: 4, cols: 2 };
typeMap[FLOAT_MAT4x3] = { Type: Float32Array, size: 64, setter: floatMat43Setter, rows: 4, cols: 3 };
typeMap[SAMPLER_2D] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_2D
};
typeMap[SAMPLER_CUBE] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_CUBE_MAP
};
typeMap[SAMPLER_3D] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_3D
};
typeMap[SAMPLER_2D_SHADOW] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_2D
};
typeMap[SAMPLER_2D_ARRAY] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_2D_ARRAY
};
typeMap[SAMPLER_2D_ARRAY_SHADOW] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_2D_ARRAY
};
typeMap[SAMPLER_CUBE_SHADOW] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_CUBE_MAP
};
typeMap[INT_SAMPLER_2D] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_2D
};
typeMap[INT_SAMPLER_3D] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_3D
};
typeMap[INT_SAMPLER_CUBE] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_CUBE_MAP
};
typeMap[INT_SAMPLER_2D_ARRAY] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_2D_ARRAY
};
typeMap[UNSIGNED_INT_SAMPLER_2D] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_2D
};
typeMap[UNSIGNED_INT_SAMPLER_3D] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_3D
};
typeMap[UNSIGNED_INT_SAMPLER_CUBE] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_CUBE_MAP
};
typeMap[UNSIGNED_INT_SAMPLER_2D_ARRAY] = {
  Type: null,
  size: 0,
  setter: samplerSetter,
  arraySetter: samplerArraySetter,
  bindPoint: TEXTURE_2D_ARRAY
};

function floatAttribSetter(gl: ProgramGLContext, index: number): AttribSetter {
  return function (b: AttribInfoLike) {
    if (b.value) {
      gl.disableVertexAttribArray(index);
      switch (b.value.length) {
        case 4:
          gl.vertexAttrib4fv(index, b.value);
          break;
        case 3:
          gl.vertexAttrib3fv(index, b.value);
          break;
        case 2:
          gl.vertexAttrib2fv(index, b.value);
          break;
        case 1:
          gl.vertexAttrib1fv(index, b.value);
          break;
        default:
          throw new Error('the length of a float constant value must be between 1 and 4!');
      }
    } else {
      gl.bindBuffer(ARRAY_BUFFER, b.buffer || null);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(
        index,
        b.numComponents || b.size || 0,
        b.type || FLOAT,
        b.normalize || false,
        b.stride || 0,
        b.offset || 0
      );
      const gl2 = gl as WebGL2RenderingContext;
      if (gl2.vertexAttribDivisor) {
        gl2.vertexAttribDivisor(index, b.divisor || 0);
      }
    }
  };
}

function intAttribSetter(gl: WebGL2RenderingContext, index: number): AttribSetter {
  return function (b: AttribInfoLike) {
    if (b.value) {
      gl.disableVertexAttribArray(index);
      if (b.value.length === 4) {
        gl.vertexAttribI4iv(index, b.value as Int32List);
      } else {
        throw new Error('The length of an integer constant value must be 4!');
      }
    } else {
      gl.bindBuffer(ARRAY_BUFFER, b.buffer || null);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribIPointer(index, b.numComponents || b.size || 0, b.type || INT, b.stride || 0, b.offset || 0);
      if (gl.vertexAttribDivisor) {
        gl.vertexAttribDivisor(index, b.divisor || 0);
      }
    }
  };
}

function uintAttribSetter(gl: WebGL2RenderingContext, index: number): AttribSetter {
  return function (b: AttribInfoLike) {
    if (b.value) {
      gl.disableVertexAttribArray(index);
      if (b.value.length === 4) {
        gl.vertexAttribI4uiv(index, b.value as Uint32List);
      } else {
        throw new Error('The length of an unsigned integer constant value must be 4!');
      }
    } else {
      gl.bindBuffer(ARRAY_BUFFER, b.buffer || null);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribIPointer(index, b.numComponents || b.size || 0, b.type || UNSIGNED_INT, b.stride || 0, b.offset || 0);
      if (gl.vertexAttribDivisor) {
        gl.vertexAttribDivisor(index, b.divisor || 0);
      }
    }
  };
}

function matAttribSetter(gl: WebGL2RenderingContext, index: number, typeInfo: AttrTypeMapEntry): AttribSetter {
  const defaultSize = typeInfo.size;
  const count = typeInfo.count || 1;

  return function (b: AttribInfoLike) {
    gl.bindBuffer(ARRAY_BUFFER, b.buffer || null);
    const numComponents = b.size || b.numComponents || defaultSize;
    const size = numComponents / count;
    const type = b.type || FLOAT;
    const mappedTypeInfo = typeMap[type];
    if (!mappedTypeInfo) {
      throw new Error('unknown attribute type');
    }
    const stride = mappedTypeInfo.size * numComponents;
    const normalize = b.normalize || false;
    const offset = b.offset || 0;
    const rowOffset = stride / count;
    for (let i = 0; i < count; ++i) {
      gl.enableVertexAttribArray(index + i);
      gl.vertexAttribPointer(index + i, size, type, normalize, stride, offset + rowOffset * i);
      if (gl.vertexAttribDivisor) {
        gl.vertexAttribDivisor(index + i, b.divisor || 0);
      }
    }
  };
}

const attrTypeMap: Record<number, AttrTypeMapEntry> = {};
attrTypeMap[FLOAT] = { size: 4, setter: floatAttribSetter };
attrTypeMap[FLOAT_VEC2] = { size: 8, setter: floatAttribSetter };
attrTypeMap[FLOAT_VEC3] = { size: 12, setter: floatAttribSetter };
attrTypeMap[FLOAT_VEC4] = { size: 16, setter: floatAttribSetter };
attrTypeMap[INT] = { size: 4, setter: intAttribSetter };
attrTypeMap[INT_VEC2] = { size: 8, setter: intAttribSetter };
attrTypeMap[INT_VEC3] = { size: 12, setter: intAttribSetter };
attrTypeMap[INT_VEC4] = { size: 16, setter: intAttribSetter };
attrTypeMap[UNSIGNED_INT] = { size: 4, setter: uintAttribSetter };
attrTypeMap[UNSIGNED_INT_VEC2] = { size: 8, setter: uintAttribSetter };
attrTypeMap[UNSIGNED_INT_VEC3] = { size: 12, setter: uintAttribSetter };
attrTypeMap[UNSIGNED_INT_VEC4] = { size: 16, setter: uintAttribSetter };
attrTypeMap[BOOL] = { size: 4, setter: intAttribSetter };
attrTypeMap[BOOL_VEC2] = { size: 8, setter: intAttribSetter };
attrTypeMap[BOOL_VEC3] = { size: 12, setter: intAttribSetter };
attrTypeMap[BOOL_VEC4] = { size: 16, setter: intAttribSetter };
attrTypeMap[FLOAT_MAT2] = { size: 4, setter: matAttribSetter, count: 2 };
attrTypeMap[FLOAT_MAT3] = { size: 9, setter: matAttribSetter, count: 3 };
attrTypeMap[FLOAT_MAT4] = { size: 16, setter: matAttribSetter, count: 4 };

// make sure we don't see a global gl
const gl = undefined; /* eslint-disable-line */

const errorRE = /ERROR:\s*\d+:(\d+)/gi;
function addLineNumbersWithError(src: string, log = '', lineOffset = 0): string {
  // Note: Error message formats are not defined by any spec so this may or may not work.
  const matches = [...log.matchAll(errorRE)];
  const lineNoToErrorMap = new Map(
    matches.map((m, ndx) => {
      const lineNo = parseInt(m[1], 10);
      const next = matches[ndx + 1];
      const end = next ? next.index : log.length;
      const msg = log.substring(m.index || 0, end);
      return [lineNo - 1, msg];
    })
  );
  return src
    .split('\n')
    .map((line: string, lineNo: number) => {
      const err = lineNoToErrorMap.get(lineNo);
      return `${lineNo + 1 + lineOffset}: ${line}${err ? `\n\n^^^ ${err}` : ''}`;
    })
    .join('\n');
}

/**
 * Error Callback
 * @callback ErrorCallback
 * @param {string} msg error message.
 * @param {number} [lineOffset] amount to add to line number
 * @memberOf module:twgl
 */

/**
 * Program Callback
 * @callback ProgramCallback
 * @param {string} [err] error message, falsy if no error
 * @param {WebGLProgram|module:twgl.ProgramInfo} [result] the program or programInfo
 */

const spaceRE = /^[ \t]*\n/;

/**
 * Remove the first end of line because WebGL 2.0 requires
 * #version 300 es
 * as the first line. No whitespace allowed before that line
 * so
 *
 * <script>
 * #version 300 es
 * </script>
 *
 * Has one line before it which is invalid according to GLSL ES 3.00
 *
 * @param {string} shaderSource The source of the shader
 * @returns {{shaderSource: string, lineOffset: number}}
 * @private
 */
function prepShaderSource(shaderSource: string): { lineOffset: number; shaderSource: string } {
  let lineOffset = 0;
  if (spaceRE.test(shaderSource)) {
    lineOffset = 1;
    shaderSource = shaderSource.replace(spaceRE, '');
  }
  return { lineOffset, shaderSource };
}

/**
 * @param {module:twgl.ProgramOptions} progOptions
 * @param {string} msg
 * @return null
 * @private
 */
function reportError(progOptions: ProgramCreationOptions, msg: string): null {
  progOptions.errorCallback(msg);
  const callback = progOptions.callback;
  if (callback) {
    setTimeout(() => {
      callback(`${msg}\n${progOptions.errors.join('\n')}`);
    });
  }
  return null;
}

/**
 * Check Shader status
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext to use.
 * @param {number} shaderType The shader type
 * @param {WebGLShader} shader The shader
 * @param {ErrorCallback} [errFn] function to receive error message.
 * @return {string} errors or empty string
 * @private
 */
function checkShaderStatus(gl: ProgramGLContext, shaderType: number, shader: WebGLShader, errFn?: ErrorCallback): string {
  const report = errFn || error;
  // Check the compile status
  const compiled = gl.getShaderParameter(shader, COMPILE_STATUS);
  if (!compiled) {
    // Something went wrong during compilation; get the error
    const lastError = gl.getShaderInfoLog(shader) || '';
    const { lineOffset, shaderSource } = prepShaderSource(gl.getShaderSource(shader) || '');
    const error = `${addLineNumbersWithError(
      shaderSource,
      lastError,
      lineOffset
    )}\nError compiling ${utils.glEnumToString(gl as unknown as Parameters<typeof utils.glEnumToString>[0], shaderType)}: ${lastError}`;
    report(error);
    return error;
  }
  return '';
}

/**
 * @typedef {Object} FullProgramSpec
 * @property {string[]} shaders the shader source or element ids.
 * @property {function(string)} [errorCallback] callback for errors
 * @property {Object.<string,number>|string[]} [attribLocations] a attribute name to location map, or array of attribute names where index = location.
 * @property {(module:twgl.BufferInfo|Object.<string,module:twgl.AttribInfo>|string[])} [transformFeedbackVaryings] If passed
 *   a BufferInfo will use the attribs names inside. If passed an object of AttribInfos will use the names from that object. Otherwise
 *   you can pass an array of names.
 * @property {number} [transformFeedbackMode] the mode to pass `gl.transformFeedbackVaryings`. Defaults to `SEPARATE_ATTRIBS`.
 * @property {ProgramCallback} [callback] callback for async program compilation.
 * @memberOf module:twgl
 */

/**
 * @typedef {string[]|module:twgl.FullProgramSpec} ProgramSpec
 * @memberOf module:twgl
 */

/**
 * @typedef {Object} ProgramOptions
 * @property {function(string)} [errorCallback] callback for errors
 * @property {Object.<string,number>|string[]} [attribLocations] a attribute name to location map, or array of attribute names where index = location.
 * @property {(module:twgl.BufferInfo|Object.<string,module:twgl.AttribInfo>|string[])} [transformFeedbackVaryings] If passed
 *   a BufferInfo will use the attribs names inside. If passed an object of AttribInfos will use the names from that object. Otherwise
 *   you can pass an array of names.
 * @property {number} [transformFeedbackMode] the mode to pass `gl.transformFeedbackVaryings`. Defaults to `SEPARATE_ATTRIBS`.
 * @property {ProgramCallback} [callback] callback for async program compilation.
 * @memberOf module:twgl
 */

/**
 * Gets the program options based on all these optional arguments
 * @param {module:twgl.ProgramOptions|string[]} [opt_attribs] Options for the program or an array of attribs names. Locations will be assigned by index if not passed in
 * @param {number[]} [opt_locations] The locations for the. A parallel array to opt_attribs letting you assign locations.
 * @param {module:twgl.ErrorCallback} [opt_errorCallback] callback for errors. By default it just prints an error to the console
 *        on error. If you want something else pass an callback. It's passed an error message.
 * @return {module:twgl.ProgramOptions} an instance of ProgramOptions based on the arguments passed in
 * @private
 */
function getProgramOptions(
  opt_attribs?: ProgramOptionsArg,
  opt_locations?: number[] | ErrorCallback,
  opt_errorCallback?: ErrorCallback
): ProgramCreationOptions {
  let transformFeedbackVaryings;
  let transformFeedbackMode;
  let callback;
  if (typeof opt_locations === 'function') {
    opt_errorCallback = opt_locations;
    opt_locations = undefined;
  }
  if (typeof opt_attribs === 'function') {
    opt_errorCallback = opt_attribs;
    opt_attribs = undefined;
  } else if (opt_attribs && !Array.isArray(opt_attribs)) {
    const opt = opt_attribs as ProgramOptionsLike;
    opt_errorCallback = opt.errorCallback;
    opt_attribs = opt.attribLocations;
    transformFeedbackVaryings = opt.transformFeedbackVaryings;
    transformFeedbackMode = opt.transformFeedbackMode;
    callback = opt.callback;
  }

  const errorCallback = opt_errorCallback || error;
  const errors: string[] = [];
  const options: ProgramCreationOptions = {
    errorCallback(msg: string, ...args: unknown[]) {
      errors.push(msg);
      errorCallback(msg, ...(args as [number?]));
    },
    transformFeedbackVaryings,
    transformFeedbackMode,
    callback,
    errors
  };

  {
    let attribLocations: Record<string, number> = {};
    if (Array.isArray(opt_attribs)) {
      opt_attribs.forEach(function (attrib: string, ndx: number) {
        attribLocations[attrib] = opt_locations ? (opt_locations[ndx] ?? ndx) : ndx;
      });
    } else {
      attribLocations = (opt_attribs as Record<string, number>) || {};
    }
    options.attribLocations = attribLocations;
  }

  return options;
}

const defaultShaderType = [GL_SHADER_TYPE.VERTEX_SHADER, GL_SHADER_TYPE.FRAGMENT_SHADER] as const;

function getShaderTypeFromScriptType(gl: ProgramGLContext, scriptType: string): number | undefined {
  if (scriptType.indexOf('frag') >= 0) {
    return FRAGMENT_SHADER;
  } else if (scriptType.indexOf('vert') >= 0) {
    return VERTEX_SHADER;
  }
  return undefined;
}

function deleteProgramAndShaders(gl: ProgramGLContext, program: WebGLProgram, notThese: Set<string | WebGLShader>): void {
  const shaders = gl.getAttachedShaders(program) || [];
  for (const shader of shaders) {
    if (notThese.has(shader)) {
      gl.deleteShader(shader);
    }
  }
  gl.deleteProgram(program);
}

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function createProgramNoCheck(
  gl: WebGL2RenderingContext,
  shaders: (string | WebGLShader)[],
  programOptions?: ProgramOptionsArg
): WebGLProgram {
  const program = gl.createProgram()!;
  const { attribLocations, transformFeedbackVaryings, transformFeedbackMode } = getProgramOptions(programOptions);

  for (let ndx = 0; ndx < shaders.length; ++ndx) {
    let shader = shaders[ndx];
    if (typeof shader === 'string') {
      const elem = getElementById(shader) as HTMLScriptElement;
      const src = elem ? elem.text : shader;
      let type = defaultShaderType[ndx];
      if (elem && elem.type) {
        type = getShaderTypeFromScriptType(gl, elem.type) || type;
      }
      shader = gl.createShader(type)!;
      gl.shaderSource(shader, prepShaderSource(src).shaderSource);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
  }

  for (const attrib in attribLocations) {
    gl.bindAttribLocation(program, attribLocations[attrib]!, attrib);
  }

  {
    let varyings = transformFeedbackVaryings;
    if (varyings) {
      const varyingInfo = varyings as { attribs?: Record<string, unknown> };
      if (varyingInfo.attribs) {
        varyings = varyingInfo.attribs;
      }
      if (!Array.isArray(varyings)) {
        varyings = Object.keys(varyings as Record<string, unknown>);
      }
      gl.transformFeedbackVaryings(program, varyings as string[], transformFeedbackMode || SEPARATE_ATTRIBS);
    }
  }

  gl.linkProgram(program);
  return program;
}

/**
 * Creates a program, attaches (and/or compiles) shaders, binds attrib locations, links the
 * program.
 *
 * NOTE: There are 4 signatures for this function
 *
 *     twgl.createProgram(gl, [vs, fs], options);
 *     twgl.createProgram(gl, [vs, fs], opt_errFunc);
 *     twgl.createProgram(gl, [vs, fs], opt_attribs, opt_errFunc);
 *     twgl.createProgram(gl, [vs, fs], opt_attribs, opt_locations, opt_errFunc);
 *
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext to use.
 * @param {WebGLShader[]|string[]} shaders The shaders to attach, or element ids for their source, or strings that contain their source
 * @param {module:twgl.ProgramOptions|string[]|module:twgl.ErrorCallback} [opt_attribs] Options for the program or an array of attribs names or an error callback. Locations will be assigned by index if not passed in
 * @param {number[]|module:twgl.ErrorCallback} [opt_locations] The locations for the. A parallel array to opt_attribs letting you assign locations or an error callback.
 * @param {module:twgl.ErrorCallback} [opt_errorCallback] callback for errors. By default it just prints an error to the console
 *        on error. If you want something else pass an callback. It's passed an error message.
 * @return {WebGLProgram?} the created program or null if error of a callback was provided.
 * @memberOf module:twgl/programs
 */
function createProgram(
  gl: WebGL2RenderingContext,
  shaders: (string | WebGLShader)[],
  opt_attribs?: ProgramOptionsArg,
  opt_locations?: number[] | ErrorCallback,
  opt_errorCallback?: ErrorCallback
): WebGLProgram | undefined {
  // This code is really convoluted, because it may or may not be async
  // Maybe it would be better to have a separate function
  const progOptions = getProgramOptions(opt_attribs, opt_locations, opt_errorCallback);
  const shaderSet = new Set<string | WebGLShader>(shaders);
  const program = createProgramNoCheck(gl, shaders as [string, string] | [WebGLShader, WebGLShader], progOptions);

  function hasErrors(gl: WebGL2RenderingContext, program: WebGLProgram): string | undefined {
    const errors = getProgramErrors(gl, program, progOptions.errorCallback);
    if (errors) {
      deleteProgramAndShaders(gl, program, shaderSet);
    }
    return errors;
  }

  if (progOptions.callback) {
    const callback = progOptions.callback;
    waitForProgramLinkCompletionAsync(gl, program).then(() => {
      const errors = hasErrors(gl, program);
      callback(errors, errors ? undefined : program);
    });
    return undefined;
  }

  return hasErrors(gl, program) ? undefined : program;
}

/**
 * This only works because the functions it wraps the first 2 arguments
 * are gl and any, followed by things that become programOptions
 * @private
 */
function wrapCallbackFnToAsyncFn<Result>(
  fn: (gl: WebGL2RenderingContext, arg1: any, ...args: any[]) => Result | undefined
) {
  return function (gl: WebGL2RenderingContext, arg1: any, ...args: any[]) {
    return new Promise<Result | undefined>((resolve, reject) => {
      const programOptions = getProgramOptions(
        args[0] as ProgramOptionsArg,
        args[1] as number[] | ErrorCallback | undefined,
        args[2] as ErrorCallback | undefined
      );
      programOptions.callback = (err?: string, result?: unknown) => {
        if (err) {
          reject(err);
        } else {
          resolve(result as Result | undefined);
        }
      };
      fn(gl, arg1, programOptions);
    });
  };
}

/**
 * Same as createProgram but returns a promise
 *
 * NOTE: There are 4 signatures for this function
 *
 *     twgl.createProgramAsync(gl, [vs, fs], options);
 *     twgl.createProgramAsync(gl, [vs, fs], opt_errFunc);
 *     twgl.createProgramAsync(gl, [vs, fs], opt_attribs, opt_errFunc);
 *     twgl.createProgramAsync(gl, [vs, fs], opt_attribs, opt_locations, opt_errFunc);
 *
 * @function
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext to use.
 * @param {WebGLShader[]|string[]} shaders The shaders to attach, or element ids for their source, or strings that contain their source
 * @param {module:twgl.ProgramOptions|string[]|module:twgl.ErrorCallback} [opt_attribs] Options for the program or an array of attribs names or an error callback. Locations will be assigned by index if not passed in
 * @param {number[]|module:twgl.ErrorCallback} [opt_locations] The locations for the. A parallel array to opt_attribs letting you assign locations or an error callback.
 * @param {module:twgl.ErrorCallback} [opt_errorCallback] callback for errors. By default it just prints an error to the console
 *        on error. If you want something else pass an callback. It's passed an error message.
 * @return {Promise<WebGLProgram>} The created program
 * @memberOf module:twgl/programs
 */
const createProgramAsync = wrapCallbackFnToAsyncFn(createProgram);

/**
 * Same as createProgramInfo but returns a promise
 * @function
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext
 *        to use.
 * @param {string[]} shaderSources Array of sources for the
 *        shaders or ids. The first is assumed to be the vertex shader,
 *        the second the fragment shader.
 * @param {module:twgl.ProgramOptions|string[]|module:twgl.ErrorCallback} [opt_attribs] Options for the program or an array of attribs names or an error callback. Locations will be assigned by index if not passed in
 * @param {number[]|module:twgl.ErrorCallback} [opt_locations] The locations for the. A parallel array to opt_attribs letting you assign locations or an error callback.
 * @param {module:twgl.ErrorCallback} [opt_errorCallback] callback for errors. By default it just prints an error to the console
 *        on error. If you want something else pass an callback. It's passed an error message.
 * @return {Promise<module:twgl.ProgramInfo>} The created ProgramInfo
 * @memberOf module:twgl/programs
 */
const createProgramInfoAsync = wrapCallbackFnToAsyncFn(createProgramInfo);

async function waitForProgramLinkCompletionAsync(gl: WebGL2RenderingContext, program: WebGLProgram): Promise<void> {
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  const checkFn = ext
    ? (currentGl: WebGL2RenderingContext, currentProgram: WebGLProgram) =>
        currentGl.getProgramParameter(currentProgram, ext.COMPLETION_STATUS_KHR)
    : () => true;

  let waitTime = 0;
  do {
    await wait(waitTime); // must wait at least once
    waitTime = 1000 / 60;
  } while (!checkFn(gl, program));
}

async function waitForAllProgramsLinkCompletionAsync(
  gl: WebGL2RenderingContext,
  programs: Record<string, WebGLProgram>
): Promise<void> {
  for (const program of Object.values(programs)) {
    await waitForProgramLinkCompletionAsync(gl, program);
  }
}

/**
 * Check a program's link status
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext to use.
 * @param {WebGLProgram} program Program to check
 * @param {ErrorCallback} [errFn] func for errors
 * @return {string?} errors if program is failed, else undefined
 * @private
 */
function getProgramErrors(gl: ProgramGLContext, program: WebGLProgram, errFn?: ErrorCallback): string | undefined {
  const report = errFn || error;
  // Check the link status
  const linked = gl.getProgramParameter(program, LINK_STATUS);
  if (!linked) {
    // something went wrong with the link
    const lastError = gl.getProgramInfoLog(program) || '';
    report(`Error in program linking: ${lastError}`);
    // print any errors from these shaders
    const shaders = gl.getAttachedShaders(program) || [];
    const errors = shaders.map((shader) =>
      checkShaderStatus(gl, gl.getShaderParameter(shader, gl.SHADER_TYPE), shader, report)
    );
    return `${lastError}\n${errors.filter((message) => message).join('\n')}`;
  }
  return undefined;
}

/**
 * Creates a program from 2 script tags.
 *
 * NOTE: There are 4 signatures for this function
 *
 *     twgl.createProgramFromScripts(gl, [vs, fs], opt_options);
 *     twgl.createProgramFromScripts(gl, [vs, fs], opt_errFunc);
 *     twgl.createProgramFromScripts(gl, [vs, fs], opt_attribs, opt_errFunc);
 *     twgl.createProgramFromScripts(gl, [vs, fs], opt_attribs, opt_locations, opt_errFunc);
 *
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext
 *        to use.
 * @param {string[]} shaderScriptIds Array of ids of the script
 *        tags for the shaders. The first is assumed to be the
 *        vertex shader, the second the fragment shader.
 * @param {module:twgl.ProgramOptions|string[]|module:twgl.ErrorCallback} [opt_attribs] Options for the program or an array of attribs names or an error callback. Locations will be assigned by index if not passed in
 * @param {number[]|module:twgl.ErrorCallback} [opt_locations] The locations for the. A parallel array to opt_attribs letting you assign locations or an error callback.
 * @param {module:twgl.ErrorCallback} [opt_errorCallback] callback for errors. By default it just prints an error to the console
 *        on error. If you want something else pass an callback. It's passed an error message.
 * @return {WebGLProgram?} the created program or null if error or a callback was provided.
 * @memberOf module:twgl/programs
 */
function createProgramFromScripts(
  gl: WebGL2RenderingContext,
  shaderScriptIds: string[],
  opt_attribs?: ProgramOptionsArg,
  opt_locations?: number[] | ErrorCallback,
  opt_errorCallback?: ErrorCallback
): WebGLProgram | null | undefined {
  const progOptions = getProgramOptions(opt_attribs, opt_locations, opt_errorCallback);
  const shaders: string[] = [];
  for (const scriptId of shaderScriptIds) {
    const shaderScript = getElementById(scriptId) as HTMLScriptElement | null;
    if (!shaderScript) {
      return reportError(progOptions, `unknown script element: ${scriptId}`);
    }
    shaders.push(shaderScript.text);
  }
  return createProgram(gl, shaders, progOptions);
}

/**
 * Creates a program from 2 sources.
 *
 * NOTE: There are 4 signatures for this function
 *
 *     twgl.createProgramFromSource(gl, [vs, fs], opt_options);
 *     twgl.createProgramFromSource(gl, [vs, fs], opt_errFunc);
 *     twgl.createProgramFromSource(gl, [vs, fs], opt_attribs, opt_errFunc);
 *     twgl.createProgramFromSource(gl, [vs, fs], opt_attribs, opt_locations, opt_errFunc);
 *
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext
 *        to use.
 * @param {string[]} shaderSources Array of sources for the
 *        shaders. The first is assumed to be the vertex shader,
 *        the second the fragment shader.
 * @param {module:twgl.ProgramOptions|string[]|module:twgl.ErrorCallback} [opt_attribs] Options for the program or an array of attribs names or an error callback. Locations will be assigned by index if not passed in
 * @param {number[]|module:twgl.ErrorCallback} [opt_locations] The locations for the. A parallel array to opt_attribs letting you assign locations or an error callback.
 * @param {module:twgl.ErrorCallback} [opt_errorCallback] callback for errors. By default it just prints an error to the console
 *        on error. If you want something else pass an callback. It's passed an error message.
 * @return {WebGLProgram?} the created program or null if error or a callback was provided.
 * @memberOf module:twgl/programs
 */
function createProgramFromSources(
  gl: WebGL2RenderingContext,
  shaderSources: string[],
  opt_attribs?: ProgramOptionsArg,
  opt_locations?: number[] | ErrorCallback,
  opt_errorCallback?: ErrorCallback
): WebGLProgram | undefined {
  return createProgram(gl, shaderSources, opt_attribs, opt_locations, opt_errorCallback);
}

/**
 * Returns true if attribute/uniform is a reserved/built in
 *
 * It makes no sense to me why GL returns these because it's
 * illegal to call `gl.getUniformLocation` and `gl.getAttribLocation`
 * with names that start with `gl_` (and `webgl_` in WebGL)
 *
 * I can only assume they are there because they might count
 * when computing the number of uniforms/attributes used when you want to
 * know if you are near the limit. That doesn't really make sense
 * to me but the fact that these get returned are in the spec.
 *
 * @param {WebGLActiveInfo} info As returned from `gl.getActiveUniform` or
 *    `gl.getActiveAttrib`.
 * @return {bool} true if it's reserved
 * @private
 */
function isBuiltIn(info: WebGLActiveInfo): boolean {
  const name = info.name;
  return name.startsWith('gl_') || name.startsWith('webgl_');
}

const tokenRE = /(\.|\[|]|\w+)/g;
const isDigit = (s: string) => s >= '0' && s <= '9';
function addSetterToUniformTree(
  fullPath: string,
  setter: UniformSetter,
  node: UniformTree,
  uniformSetters: UniformSetterMap
): void {
  const tokens = fullPath.split(tokenRE).filter((s: string) => s !== '');
  let tokenNdx = 0;
  let path = '';

  for (;;) {
    const token = tokens[tokenNdx++]; // has to be name or number
    path += token;
    const isArrayIndex = isDigit(token[0]);
    const accessor = isArrayIndex ? parseInt(token, 10) : token;
    if (isArrayIndex) {
      path += tokens[tokenNdx++]; // skip ']'
    }
    const isLastToken = tokenNdx === tokens.length;
    if (isLastToken) {
      node[accessor] = setter;
      break;
    } else {
      const token = tokens[tokenNdx++]; // has to be . or [
      const isArray = token === '[';
      const child = (node[accessor] as UniformTree | undefined) || (isArray ? [] : {});
      node[accessor] = child;
      node = child as UniformTree;
      uniformSetters[path] =
        uniformSetters[path] ||
        (function (treeNode: UniformTree) {
          return function (value: unknown) {
            setUniformTree(treeNode, value as Record<string, unknown>);
          };
        })(child);
      path += token;
    }
  }
}

/**
 * Creates setter functions for all uniforms of a shader
 * program.
 *
 * @see {@link module:twgl.setUniforms}
 *
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext to use.
 * @param {WebGLProgram} program the program to create setters for.
 * @returns {Object.<string, function>} an object with a setter by name for each uniform
 * @memberOf module:twgl/programs
 */
function createUniformSetters(gl: ProgramGLContext, program: WebGLProgram): UniformSetterMap {
  let textureUnit = 0;

  /**
   * Creates a setter for a uniform of the given program with it's
   * location embedded in the setter.
   * @param {WebGLProgram} program
   * @param {WebGLUniformInfo} uniformInfo
   * @returns {function} the created setter.
   */
  function createUniformSetter(
    program: WebGLProgram,
    uniformInfo: WebGLActiveInfo,
    location: WebGLUniformLocation
  ): UniformSetter {
    const isArray = uniformInfo.name.endsWith('[0]');
    const type = uniformInfo.type;
    const typeInfo = typeMap[type];
    if (!typeInfo) {
      throw new Error(`unknown type: 0x${type.toString(16)}`); // we should never get here.
    }
    let setter;
    if (typeInfo.bindPoint) {
      // it's a sampler
      const unit = textureUnit;
      textureUnit += uniformInfo.size;
      if (isArray) {
        setter = (typeInfo.arraySetter || typeInfo.setter)(gl, type, unit, location, uniformInfo.size);
      } else {
        setter = typeInfo.setter(gl, type, unit, location, uniformInfo.size);
      }
    } else {
      if (typeInfo.arraySetter && isArray) {
        setter = typeInfo.arraySetter(gl, location);
      } else {
        setter = typeInfo.setter(gl, location);
      }
    }
    setter.location = location;
    return setter;
  }

  const uniformSetters: UniformSetterMap = {};
  const uniformTree: UniformTree = {};
  const numUniforms = gl.getProgramParameter(program, ACTIVE_UNIFORMS);

  for (let ii = 0; ii < numUniforms; ++ii) {
    const uniformInfo = gl.getActiveUniform(program, ii);
    if (!uniformInfo) {
      continue;
    }
    if (isBuiltIn(uniformInfo)) {
      continue;
    }
    let name = uniformInfo.name;
    // remove the array suffix.
    if (name.endsWith('[0]')) {
      name = name.substr(0, name.length - 3);
    }
    const location = gl.getUniformLocation(program, uniformInfo.name);
    // the uniform will have no location if it's in a uniform block
    if (location) {
      const setter = createUniformSetter(program, uniformInfo, location);
      uniformSetters[name] = setter;
      addSetterToUniformTree(name, setter, uniformTree, uniformSetters);
    }
  }

  return uniformSetters;
}

/**
 * @typedef {Object} TransformFeedbackInfo
 * @property {number} index index of transform feedback
 * @property {number} type GL type
 * @property {number} size 1 - 4
 * @memberOf module:twgl
 */

/**
 * Create TransformFeedbackInfo for passing to bindTransformFeedbackInfo.
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext to use.
 * @param {WebGLProgram} program an existing WebGLProgram.
 * @return {Object<string, module:twgl.TransformFeedbackInfo>}
 * @memberOf module:twgl
 */
function createTransformFeedbackInfo(gl: WebGL2RenderingContext, program: WebGLProgram): TransformFeedbackInfoMap {
  const info: TransformFeedbackInfoMap = {};
  const numVaryings = gl.getProgramParameter(program, TRANSFORM_FEEDBACK_VARYINGS);
  for (let ii = 0; ii < numVaryings; ++ii) {
    const varying = gl.getTransformFeedbackVarying(program, ii);
    if (!varying) {
      continue;
    }
    info[varying.name] = {
      index: ii,
      type: varying.type,
      size: varying.size
    };
  }
  return info;
}

/**
 * Binds buffers for transform feedback.
 *
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext to use.
 * @param {(module:twgl.ProgramInfo|Object<string, module:twgl.TransformFeedbackInfo>)} transformFeedbackInfo A ProgramInfo or TransformFeedbackInfo.
 * @param {(module:twgl.BufferInfo|Object<string, module:twgl.AttribInfo>)} [bufferInfo] A BufferInfo or set of AttribInfos.
 * @memberOf module:twgl
 */
function bindTransformFeedbackInfo(
  gl: WebGL2RenderingContext,
  transformFeedbackInfo: ProgramInfoLike | TransformFeedbackInfoMap,
  bufferInfo?: BufferInfoLike | Record<string, AttribInfoLike>
): void {
  const feedbackInfo = (transformFeedbackInfo as ProgramInfoLike).transformFeedbackInfo ||
    (transformFeedbackInfo as TransformFeedbackInfoMap);
  if (!bufferInfo) {
    return;
  }
  if ((bufferInfo as BufferInfoLike).attribs) {
    bufferInfo = (bufferInfo as BufferInfoLike).attribs!;
  }
  for (const name in bufferInfo) {
    const varying = feedbackInfo[name];
    if (varying) {
      const buf = (bufferInfo as Record<string, AttribInfoLike>)[name];
      if (buf.offset) {
        gl.bindBufferRange(TRANSFORM_FEEDBACK_BUFFER, varying.index, buf.buffer || null, buf.offset, buf.size ?? 0);
      } else {
        gl.bindBufferBase(TRANSFORM_FEEDBACK_BUFFER, varying.index, buf.buffer || null);
      }
    }
  }
}

/**
 * Creates a transform feedback and sets the buffers
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext to use.
 * @param {module:twgl.ProgramInfo} programInfo A ProgramInfo as returned from {@link module:twgl.createProgramInfo}
 * @param {(module:twgl.BufferInfo|Object<string, module:twgl.AttribInfo>)} [bufferInfo] A BufferInfo or set of AttribInfos.
 * @return {WebGLTransformFeedback} the created transform feedback
 * @memberOf module:twgl
 */
function createTransformFeedback(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfoLike,
  bufferInfo?: BufferInfoLike | Record<string, AttribInfoLike>
): WebGLTransformFeedback | null {
  const tf = gl.createTransformFeedback();
  gl.bindTransformFeedback(TRANSFORM_FEEDBACK, tf);
  gl.useProgram(programInfo.program);
  bindTransformFeedbackInfo(gl, programInfo, bufferInfo);
  gl.bindTransformFeedback(TRANSFORM_FEEDBACK, null);
  return tf;
}

/**
 * @typedef {Object} UniformData
 * @property {string} name The name of the uniform
 * @property {number} type The WebGL type enum for this uniform
 * @property {number} size The number of elements for this uniform
 * @property {number} blockNdx The block index this uniform appears in
 * @property {number} offset The byte offset in the block for this uniform's value
 * @memberOf module:twgl
 */

/**
 * The specification for one UniformBlockObject
 *
 * @typedef {Object} BlockSpec
 * @property {number} index The index of the block.
 * @property {number} size The size in bytes needed for the block
 * @property {number[]} uniformIndices The indices of the uniforms used by the block. These indices
 *    correspond to entries in a UniformData array in the {@link module:twgl.UniformBlockSpec}.
 * @property {bool} usedByVertexShader Self explanatory
 * @property {bool} usedByFragmentShader Self explanatory
 * @property {bool} used Self explanatory
 * @memberOf module:twgl
 */

/**
 * A `UniformBlockSpec` represents the data needed to create and bind
 * UniformBlockObjects for a given program
 *
 * @typedef {Object} UniformBlockSpec
 * @property {Object.<string, module:twgl.BlockSpec>} blockSpecs The BlockSpec for each block by block name
 * @property {UniformData[]} uniformData An array of data for each uniform by uniform index.
 * @memberOf module:twgl
 */

/**
 * Creates a UniformBlockSpec for the given program.
 *
 * A UniformBlockSpec represents the data needed to create and bind
 * UniformBlockObjects
 *
 * @param {WebGL2RenderingContext} gl A WebGL2 Rendering Context
 * @param {WebGLProgram} program A WebGLProgram for a successfully linked program
 * @return {module:twgl.UniformBlockSpec} The created UniformBlockSpec
 * @memberOf module:twgl/programs
 */
function createUniformBlockSpecFromProgram(gl: WebGL2RenderingContext, program: WebGLProgram): UniformBlockSpec {
  const numUniforms = gl.getProgramParameter(program, ACTIVE_UNIFORMS);
  const uniformData: BlockUniformData[] = [];
  const uniformIndices: number[] = [];

  for (let ii = 0; ii < numUniforms; ++ii) {
    uniformIndices.push(ii);
    const uniformInfo = gl.getActiveUniform(program, ii)!;
    uniformData.push({
      name: uniformInfo.name,
      type: 0,
      size: 0,
      blockNdx: -1,
      offset: 0
    });
  }

  const uniformProperties: Array<[number, BlockUniformNumericKey]> = [
    [gl.UNIFORM_TYPE, 'type'],
    [gl.UNIFORM_SIZE, 'size'],
    [gl.UNIFORM_BLOCK_INDEX, 'blockNdx'],
    [gl.UNIFORM_OFFSET, 'offset']
  ];
  uniformProperties.forEach(function ([pname, key]) {
    gl.getActiveUniforms(program, uniformIndices, pname).forEach(function (value: number, ndx: number) {
      uniformData[ndx][key] = value;
    });
  });

  const blockSpecs: Record<string, BlockSpec> = {};

  const numUniformBlocks = gl.getProgramParameter(program, ACTIVE_UNIFORM_BLOCKS);
  for (let ii = 0; ii < numUniformBlocks; ++ii) {
    const name = gl.getActiveUniformBlockName(program, ii);
    if (!name) {
      continue;
    }
    const blockSpec = {
      index: gl.getUniformBlockIndex(program, name),
      usedByVertexShader: gl.getActiveUniformBlockParameter(program, ii, UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER),
      usedByFragmentShader: gl.getActiveUniformBlockParameter(program, ii, UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER),
      size: gl.getActiveUniformBlockParameter(program, ii, UNIFORM_BLOCK_DATA_SIZE),
      uniformIndices: gl.getActiveUniformBlockParameter(program, ii, UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES)
    } as BlockSpec;
    blockSpec.used = Boolean(blockSpec.usedByVertexShader || blockSpec.usedByFragmentShader);
    blockSpecs[name] = blockSpec;
  }

  return {
    blockSpecs: blockSpecs,
    uniformData: uniformData
  };
}

const arraySuffixRE = /\[\d+\]\.$/; // better way to check?

const pad = (v: number, padding: number) => (((v + (padding - 1)) / padding) | 0) * padding;

function createUniformBlockUniformSetter(
  view: Float32Array | Int32Array | Uint32Array,
  isArray: boolean,
  rows?: number,
  cols?: number
): (value: UniformValue) => void {
  if (isArray || rows) {
    const resolvedCols = cols || 1;
    const numElements = view.length;
    const totalRows = numElements / 4;
    return function (value: UniformValue) {
      const arrayValue = value as ArrayLike<number>;
      let dst = 0;
      let src = 0;
      for (let row = 0; row < totalRows; ++row) {
        for (let col = 0; col < resolvedCols; ++col) {
          view[dst++] = arrayValue[src++]!;
        }
        dst += 4 - resolvedCols;
      }
    };
  } else {
    return function (value: UniformValue) {
      if (typeof value !== 'number' && value.length) {
        view.set(value);
      } else {
        view[0] = value as number;
      }
    };
  }
}

/**
 * Represents a UniformBlockObject including an ArrayBuffer with all the uniform values
 * and a corresponding WebGLBuffer to hold those values on the GPU
 *
 * @typedef {Object} UniformBlockInfo
 * @property {string} name The name of the block
 * @property {ArrayBuffer} array The array buffer that contains the uniform values
 * @property {Float32Array} asFloat A float view on the array buffer. This is useful
 *    inspecting the contents of the buffer in the debugger.
 * @property {WebGLBuffer} buffer A WebGL buffer that will hold a copy of the uniform values for rendering.
 * @property {number} [offset] offset into buffer
 * @property {Object<string, ArrayBufferView>} uniforms A uniform name to ArrayBufferView map.
 *   each Uniform has a correctly typed `ArrayBufferView` into array at the correct offset
 *   and length of that uniform. So for example a float uniform would have a 1 float `Float32Array`
 *   view. A single mat4 would have a 16 element `Float32Array` view. An ivec2 would have an
 *   `Int32Array` view, etc.
 * @property {Object<string, function>} setters A setter for this uniform.
 *   The reason to use setters is elements of arrays are padded to vec4 sizes which
 *   means if you want to set an array of 4 floats you'd need to set 16 values
 *   (or set elements 0, 4, 8, 12). In other words
 *   `someBlockInfo.uniforms.some4FloatArrayUniform.set([0, , , , 1, , , , 2, , , , 3])`
 *   where as the setter handles just passing in [0, 1, 2, 3] either directly as in
 *   `someBlockInfo.setter.some4FloatArrayUniform.set([0, 1, 2, 3])` (not recommended)
 *   or via {@link module:twgl.setBlockUniforms}
 * @memberOf module:twgl
 */

/**
 * Creates a `UniformBlockInfo` for the specified block
 *
 * Note: **If the blockName matches no existing blocks a warning is printed to the console and a dummy
 * `UniformBlockInfo` is returned**. This is because when debugging GLSL
 * it is common to comment out large portions of a shader or for example set
 * the final output to a constant. When that happens blocks get optimized out.
 * If this function did not create dummy blocks your code would crash when debugging.
 *
 * @param {WebGL2RenderingContext} gl A WebGL2RenderingContext
 * @param {WebGLProgram} program A WebGLProgram
 * @param {module:twgl.UniformBlockSpec} uniformBlockSpec. A UniformBlockSpec as returned
 *     from {@link module:twgl.createUniformBlockSpecFromProgram}.
 * @param {string} blockName The name of the block.
 * @return {module:twgl.UniformBlockInfo} The created UniformBlockInfo
 * @memberOf module:twgl/programs
 */
function createUniformBlockInfoFromProgram(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  uniformBlockSpec: UniformBlockSpec,
  blockName: string
): UniformBlockInfo {
  const blockSpecs = uniformBlockSpec.blockSpecs;
  const uniformData = uniformBlockSpec.uniformData;
  const blockSpec = blockSpecs[blockName];
  if (!blockSpec) {
    warn('no uniform block object named:', blockName);
    return {
      name: blockName,
      array: new ArrayBuffer(0),
      asFloat: new Float32Array(0),
      buffer: null,
      uniforms: {},
      setters: {}
    };
  }
  const array = new ArrayBuffer(blockSpec.size);
  const buffer = gl.createBuffer();
  const uniformBufferIndex = blockSpec.index;
  gl.bindBuffer(UNIFORM_BUFFER, buffer);
  gl.uniformBlockBinding(program, blockSpec.index, uniformBufferIndex);

  let prefix = blockName + '.';
  if (arraySuffixRE.test(prefix)) {
    prefix = prefix.replace(arraySuffixRE, '.');
  }
  const uniforms: Record<string, ArrayBufferView> = {};
  const setters: Record<string, (value: UniformValue) => void> = {};
  const setterTree: UniformTree = {};
  blockSpec.uniformIndices.forEach(function (uniformNdx: number) {
    const data = uniformData[uniformNdx];
    let name = data.name;
    if (name.startsWith(prefix)) {
      name = name.substr(prefix.length);
    }
    const isArray = name.endsWith('[0]');
    if (isArray) {
      name = name.substr(0, name.length - 3);
    }
    const typeInfo = typeMap[data.type];
    if (!typeInfo || !typeInfo.Type) {
      throw new Error(`unknown block uniform type: 0x${data.type.toString(16)}`);
    }
    const Type = typeInfo.Type;
    const byteLength = isArray ? pad(typeInfo.size, 16) * data.size : typeInfo.size * data.size;
    const uniformView = new Type(array, data.offset, byteLength / Type.BYTES_PER_ELEMENT);
    uniforms[name] = uniformView;
    // Note: I'm not sure what to do here. The original
    // idea was to create TypedArray views into each part
    // of the block. This is useful, for example if you have
    // a block with { mat4: model; mat4 view; mat4 projection; }
    // you'll get a Float32Array for each one suitable for
    // passing to most JS math libraries including twgl's and glMatrix.js.
    //
    // But, if you have a an array of structures, especially if that
    // array is large, you get a whole bunch of TypedArray views.
    // Every one of them has overhead and switching between them all
    // is probably a cache miss. In that case it would really be better
    // to just have one view (asFloat) and have all the setters
    // just reference the correct portion. But, then you can't easily
    // treat a matrix, or a vec4, as a standalone thing like you can
    // with all the views.
    //
    // Another problem with the views is they are not shared. With
    // uniforms you have one set of setters. With UniformBlockInfo
    // you have a set of setters *pre block instance*. That's because
    // TypedArray views can't be mapped to different buffers.
    //
    // My gut right now is if you really want the speed and compactness
    // then you should probably roll your own solution. TWGL's goal
    // here is ease of use as AFAICT there is no simple generic efficient
    // solution.
    const setter = createUniformBlockUniformSetter(uniformView, isArray, typeInfo.rows, typeInfo.cols);
    setters[name] = setter;
    addSetterToUniformTree(name, setter, setterTree, setters);
  });
  return {
    name: blockName,
    array,
    asFloat: new Float32Array(array), // for debugging
    buffer,
    uniforms,
    setters
  };
}

/**
 * Creates a `UniformBlockInfo` for the specified block
 *
 * Note: **If the blockName matches no existing blocks a warning is printed to the console and a dummy
 * `UniformBlockInfo` is returned**. This is because when debugging GLSL
 * it is common to comment out large portions of a shader or for example set
 * the final output to a constant. When that happens blocks get optimized out.
 * If this function did not create dummy blocks your code would crash when debugging.
 *
 * @param {WebGL2RenderingContext} gl A WebGL2RenderingContext
 * @param {module:twgl.ProgramInfo} programInfo a `ProgramInfo`
 *     as returned from {@link module:twgl.createProgramInfo}
 * @param {string} blockName The name of the block.
 * @return {module:twgl.UniformBlockInfo} The created UniformBlockInfo
 * @memberOf module:twgl/programs
 */
function createUniformBlockInfo(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfoLike & { uniformBlockSpec: UniformBlockSpec },
  blockName: string
): UniformBlockInfo {
  return createUniformBlockInfoFromProgram(gl, programInfo.program, programInfo.uniformBlockSpec, blockName);
}

/**
 * Binds a uniform block to the matching uniform block point.
 * Matches by blocks by name so blocks must have the same name not just the same
 * structure.
 *
 * If you have changed any values and you upload the values into the corresponding WebGLBuffer
 * call {@link module:twgl.setUniformBlock} instead.
 *
 * @param {WebGL2RenderingContext} gl A WebGL 2 rendering context.
 * @param {(module:twgl.ProgramInfo|module:twgl.UniformBlockSpec)} programInfo a `ProgramInfo`
 *     as returned from {@link module:twgl.createProgramInfo} or or `UniformBlockSpec` as
 *     returned from {@link module:twgl.createUniformBlockSpecFromProgram}.
 * @param {module:twgl.UniformBlockInfo} uniformBlockInfo a `UniformBlockInfo` as returned from
 *     {@link module:twgl.createUniformBlockInfo}.
 * @return {bool} true if buffer was bound. If the programInfo has no block with the same block name
 *     no buffer is bound.
 * @memberOf module:twgl/programs
 */
function bindUniformBlock(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfoLike | UniformBlockSpec,
  uniformBlockInfo: UniformBlockInfo
): boolean {
  const uniformBlockSpec = (programInfo as ProgramInfoLike).uniformBlockSpec || (programInfo as UniformBlockSpec);
  const blockSpec = uniformBlockSpec.blockSpecs[uniformBlockInfo.name];
  if (blockSpec) {
    const bufferBindIndex = blockSpec.index;
    gl.bindBufferRange(
      UNIFORM_BUFFER,
      bufferBindIndex,
      uniformBlockInfo.buffer,
      uniformBlockInfo.offset || 0,
      uniformBlockInfo.array.byteLength
    );
    return true;
  }
  return false;
}

/**
 * Uploads the current uniform values to the corresponding WebGLBuffer
 * and binds that buffer to the program's corresponding bind point for the uniform block object.
 *
 * If you haven't changed any values and you only need to bind the uniform block object
 * call {@link module:twgl.bindUniformBlock} instead.
 *
 * @param {WebGL2RenderingContext} gl A WebGL 2 rendering context.
 * @param {(module:twgl.ProgramInfo|module:twgl.UniformBlockSpec)} programInfo a `ProgramInfo`
 *     as returned from {@link module:twgl.createProgramInfo} or or `UniformBlockSpec` as
 *     returned from {@link module:twgl.createUniformBlockSpecFromProgram}.
 * @param {module:twgl.UniformBlockInfo} uniformBlockInfo a `UniformBlockInfo` as returned from
 *     {@link module:twgl.createUniformBlockInfo}.
 * @memberOf module:twgl/programs
 */
function setUniformBlock(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfoLike | UniformBlockSpec,
  uniformBlockInfo: UniformBlockInfo
): void {
  if (bindUniformBlock(gl, programInfo, uniformBlockInfo)) {
    gl.bufferData(UNIFORM_BUFFER, uniformBlockInfo.array, DYNAMIC_DRAW);
  }
}

/**
 * Sets values of a uniform block object
 *
 * @param {module:twgl.UniformBlockInfo} uniformBlockInfo A UniformBlockInfo as returned by {@link module:twgl.createUniformBlockInfo}.
 * @param {Object.<string, ?>} values A uniform name to value map where the value is correct for the given
 *    type of uniform. So for example given a block like
 *
 *       uniform SomeBlock {
 *         float someFloat;
 *         vec2 someVec2;
 *         vec3 someVec3Array[2];
 *         int someInt;
 *       }
 *
 *  You can set the values of the uniform block with
 *
 *       twgl.setBlockUniforms(someBlockInfo, {
 *          someFloat: 12.3,
 *          someVec2: [1, 2],
 *          someVec3Array: [1, 2, 3, 4, 5, 6],
 *          someInt: 5,
 *       }
 *
 *  Arrays can be JavaScript arrays or typed arrays
 *
 *  You can also fill out structure and array values either via
 *  shortcut. Example
 *
 *     // -- in shader --
 *     struct Light {
 *       float intensity;
 *       vec4 color;
 *       float nearFar[2];
 *     };
 *     uniform Lights {
 *       Light lights[2];
 *     };
 *
 *     // in JavaScript
 *
 *     twgl.setBlockUniforms(someBlockInfo, {
 *       lights: [
 *         { intensity: 5.0, color: [1, 0, 0, 1], nearFar[0.1, 10] },
 *         { intensity: 2.0, color: [0, 0, 1, 1], nearFar[0.2, 15] },
 *       ],
 *     });
 *
 *   or the more traditional way
 *
 *     twgl.setBlockUniforms(someBlockInfo, {
 *       "lights[0].intensity": 5.0,
 *       "lights[0].color": [1, 0, 0, 1],
 *       "lights[0].nearFar": [0.1, 10],
 *       "lights[1].intensity": 2.0,
 *       "lights[1].color": [0, 0, 1, 1],
 *       "lights[1].nearFar": [0.2, 15],
 *     });
 *
 *   You can also specify partial paths
 *
 *     twgl.setBlockUniforms(someBlockInfo, {
 *       'lights[1]': { intensity: 5.0, color: [1, 0, 0, 1], nearFar[0.2, 15] },
 *     });
 *
 *   But you can not specify leaf array indices.
 *
 *     twgl.setBlockUniforms(someBlockInfo, {
 *       'lights[1].nearFar[1]': 15,     // BAD! nearFar is a leaf
 *       'lights[1].nearFar': [0.2, 15], // GOOD
 *     });
 *
 *  **IMPORTANT!**, packing in a UniformBlock is unintuitive.
 *  For example the actual layout of `someVec3Array` above in memory
 *  is `1, 2, 3, unused, 4, 5, 6, unused`. twgl takes in 6 values
 *  as shown about and copies them, skipping the padding. This might
 *  be confusing if you're already familiar with Uniform blocks.
 *
 *  If you want to deal with the padding yourself you can access the array
 *  buffer views directly. eg:
 *
 *      someBlockInfo.someVec3Array.set([1, 2, 3, 0, 4, 5, 6, 0]);
 *
 *  Any name that doesn't match will be ignored
 * @memberOf module:twgl/programs
 */
function setBlockUniforms(uniformBlockInfo: UniformBlockInfo, values: Record<string, UniformValue>): void {
  const setters = uniformBlockInfo.setters;
  for (const name in values) {
    const setter = setters[name];
    if (setter) {
      const value = values[name];
      setter(value);
    }
  }
}

function setUniformTree(tree: UniformTree, values: Record<string, unknown>): void {
  for (const name in values) {
    const prop = tree[name];
    if (typeof prop === 'function') {
      (prop as (value: unknown) => void)(values[name]);
    } else {
      setUniformTree(tree[name] as UniformTree, values[name] as Record<string, unknown>);
    }
  }
}

/**
 * Set uniforms and binds related textures.
 *
 * example:
 *
 *     const programInfo = createProgramInfo(
 *         gl, ["some-vs", "some-fs"]);
 *
 *     const tex1 = gl.createTexture();
 *     const tex2 = gl.createTexture();
 *
 *     ... assume we setup the textures with data ...
 *
 *     const uniforms = {
 *       u_someSampler: tex1,
 *       u_someOtherSampler: tex2,
 *       u_someColor: [1,0,0,1],
 *       u_somePosition: [0,1,1],
 *       u_someMatrix: [
 *         1,0,0,0,
 *         0,1,0,0,
 *         0,0,1,0,
 *         0,0,0,0,
 *       ],
 *     };
 *
 *     gl.useProgram(programInfo.program);
 *
 * This will automatically bind the textures AND set the
 * uniforms.
 *
 *     twgl.setUniforms(programInfo, uniforms);
 *
 * For the example above it is equivalent to
 *
 *     let texUnit = 0;
 *     gl.activeTexture(gl.TEXTURE0 + texUnit);
 *     gl.bindTexture(gl.TEXTURE_2D, tex1);
 *     gl.uniform1i(u_someSamplerLocation, texUnit++);
 *     gl.activeTexture(gl.TEXTURE0 + texUnit);
 *     gl.bindTexture(gl.TEXTURE_2D, tex2);
 *     gl.uniform1i(u_someSamplerLocation, texUnit++);
 *     gl.uniform4fv(u_someColorLocation, [1, 0, 0, 1]);
 *     gl.uniform3fv(u_somePositionLocation, [0, 1, 1]);
 *     gl.uniformMatrix4fv(u_someMatrix, false, [
 *         1,0,0,0,
 *         0,1,0,0,
 *         0,0,1,0,
 *         0,0,0,0,
 *       ]);
 *
 * Note it is perfectly reasonable to call `setUniforms` multiple times. For example
 *
 *     const uniforms = {
 *       u_someSampler: tex1,
 *       u_someOtherSampler: tex2,
 *     };
 *
 *     const moreUniforms {
 *       u_someColor: [1,0,0,1],
 *       u_somePosition: [0,1,1],
 *       u_someMatrix: [
 *         1,0,0,0,
 *         0,1,0,0,
 *         0,0,1,0,
 *         0,0,0,0,
 *       ],
 *     };
 *
 *     twgl.setUniforms(programInfo, uniforms);
 *     twgl.setUniforms(programInfo, moreUniforms);
 *
 * You can also add WebGLSamplers to uniform samplers as in
 *
 *     const uniforms = {
 *       u_someSampler: {
 *         texture: someWebGLTexture,
 *         sampler: someWebGLSampler,
 *       },
 *     };
 *
 * In which case both the sampler and texture will be bound to the
 * same unit.
 *
 * @param {(module:twgl.ProgramInfo|Object.<string, function>)} setters a `ProgramInfo` as returned from `createProgramInfo` or the setters returned from
 *        `createUniformSetters`.
 * @param {Object.<string, ?>} values an object with values for the
 *        uniforms.
 *   You can pass multiple objects by putting them in an array or by calling with more arguments.For example
 *
 *     const sharedUniforms = {
 *       u_fogNear: 10,
 *       u_projection: ...
 *       ...
 *     };
 *
 *     const localUniforms = {
 *       u_world: ...
 *       u_diffuseColor: ...
 *     };
 *
 *     twgl.setUniforms(programInfo, sharedUniforms, localUniforms);
 *
 *     // is the same as
 *
 *     twgl.setUniforms(programInfo, [sharedUniforms, localUniforms]);
 *
 *     // is the same as
 *
 *     twgl.setUniforms(programInfo, sharedUniforms);
 *     twgl.setUniforms(programInfo, localUniforms};
 *
 *   You can also fill out structure and array values either via
 *   shortcut. Example
 *
 *     // -- in shader --
 *     struct Light {
 *       float intensity;
 *       vec4 color;
 *       float nearFar[2];
 *     };
 *     uniform Light lights[2];
 *
 *     // in JavaScript
 *
 *     twgl.setUniforms(programInfo, {
 *       lights: [
 *         { intensity: 5.0, color: [1, 0, 0, 1], nearFar[0.1, 10] },
 *         { intensity: 2.0, color: [0, 0, 1, 1], nearFar[0.2, 15] },
 *       ],
 *     });
 *
 *   or the more traditional way
 *
 *     twgl.setUniforms(programInfo, {
 *       "lights[0].intensity": 5.0,
 *       "lights[0].color": [1, 0, 0, 1],
 *       "lights[0].nearFar": [0.1, 10],
 *       "lights[1].intensity": 2.0,
 *       "lights[1].color": [0, 0, 1, 1],
 *       "lights[1].nearFar": [0.2, 15],
 *     });
 *
 *   You can also specify partial paths
 *
 *     twgl.setUniforms(programInfo, {
 *       'lights[1]': { intensity: 5.0, color: [1, 0, 0, 1], nearFar[0.2, 15] },
 *     });
 *
 *   But you can not specify leaf array indices
 *
 *     twgl.setUniforms(programInfo, {
 *       'lights[1].nearFar[1]': 15,     // BAD! nearFar is a leaf
 *       'lights[1].nearFar': [0.2, 15], // GOOD
 *     });
 *
 * @memberOf module:twgl/programs
 */
function setUniforms(
  setters: ProgramInfoLike | PublicUniformSetterMap,
  ...args: Array<Record<string, unknown> | Array<Record<string, unknown>>>
): void {
  // eslint-disable-line
  const actualSetters = (setters as ProgramInfoLike).uniformSetters || (setters as PublicUniformSetterMap);
  const numArgs = args.length;
  for (let aNdx = 0; aNdx < numArgs; ++aNdx) {
    const values = args[aNdx];
    if (Array.isArray(values)) {
      const numValues = values.length;
      for (let ii = 0; ii < numValues; ++ii) {
        setUniforms(actualSetters, values[ii]);
      }
    } else {
      for (const name in values) {
        const setter = actualSetters[name];
        if (setter) {
          setter(values[name]);
        }
      }
    }
  }
}

/**
 * Alias for `setUniforms`
 * @function
 * @param {(module:twgl.ProgramInfo|Object.<string, function>)} setters a `ProgramInfo` as returned from `createProgramInfo` or the setters returned from
 *        `createUniformSetters`.
 * @param {Object.<string, ?>} values an object with values for the
 * @memberOf module:twgl/programs
 */
const setUniformsAndBindTextures = setUniforms;

/**
 * Creates setter functions for all attributes of a shader
 * program. You can pass this to {@link module:twgl.setBuffersAndAttributes} to set all your buffers and attributes.
 *
 * @see {@link module:twgl.setAttributes} for example
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext to use.
 * @param {WebGLProgram} program the program to create setters for.
 * @return {Object.<string, function>} an object with a setter for each attribute by name.
 * @memberOf module:twgl/programs
 */
function createAttributeSetters(gl: ProgramGLContext, program: WebGLProgram): AttribSetterMap {
  const attribSetters: AttribSetterMap = {};

  const numAttribs = gl.getProgramParameter(program, ACTIVE_ATTRIBUTES);
  for (let ii = 0; ii < numAttribs; ++ii) {
    const attribInfo = gl.getActiveAttrib(program, ii);
    if (!attribInfo) {
      continue;
    }
    if (isBuiltIn(attribInfo)) {
      continue;
    }
    const index = gl.getAttribLocation(program, attribInfo.name);
    const typeInfo = attrTypeMap[attribInfo.type];
    const setter = typeInfo.setter(gl, index, typeInfo);
    setter.location = index;
    attribSetters[attribInfo.name] = setter;
  }

  return attribSetters;
}

/**
 * Sets attributes and binds buffers (deprecated... use {@link module:twgl.setBuffersAndAttributes})
 *
 * Example:
 *
 *     const program = createProgramFromScripts(
 *         gl, ["some-vs", "some-fs");
 *
 *     const attribSetters = createAttributeSetters(program);
 *
 *     const positionBuffer = gl.createBuffer();
 *     const texcoordBuffer = gl.createBuffer();
 *
 *     const attribs = {
 *       a_position: {buffer: positionBuffer, numComponents: 3},
 *       a_texcoord: {buffer: texcoordBuffer, numComponents: 2},
 *     };
 *
 *     gl.useProgram(program);
 *
 * This will automatically bind the buffers AND set the
 * attributes.
 *
 *     setAttributes(attribSetters, attribs);
 *
 * Properties of attribs. For each attrib you can add
 * properties:
 *
 * *   type: the type of data in the buffer. Default = gl.FLOAT
 * *   normalize: whether or not to normalize the data. Default = false
 * *   stride: the stride. Default = 0
 * *   offset: offset into the buffer. Default = 0
 * *   divisor: the divisor for instances. Default = undefined
 *
 * For example if you had 3 value float positions, 2 value
 * float texcoord and 4 value uint8 colors you'd setup your
 * attribs like this
 *
 *     const attribs = {
 *       a_position: {buffer: positionBuffer, numComponents: 3},
 *       a_texcoord: {buffer: texcoordBuffer, numComponents: 2},
 *       a_color: {
 *         buffer: colorBuffer,
 *         numComponents: 4,
 *         type: gl.UNSIGNED_BYTE,
 *         normalize: true,
 *       },
 *     };
 *
 * @param {Object.<string, function>} setters Attribute setters as returned from createAttributeSetters
 * @param {Object.<string, module:twgl.AttribInfo>} buffers AttribInfos mapped by attribute name.
 * @memberOf module:twgl/programs
 * @deprecated use {@link module:twgl.setBuffersAndAttributes}
 * @private
 */
function setAttributes(setters: ProgramInfoLike | PublicAttribSetterMap, buffers: Record<string, AttribInfoLike>): void {
  const actualSetters = (setters as ProgramInfoLike).attribSetters || (setters as PublicAttribSetterMap);
  for (const name in buffers) {
    const setter = actualSetters[name];
    if (setter) {
      setter(buffers[name]);
    }
  }
}

/**
 * Sets attributes and buffers including the `ELEMENT_ARRAY_BUFFER` if appropriate
 *
 * Example:
 *
 *     const programInfo = createProgramInfo(
 *         gl, ["some-vs", "some-fs");
 *
 *     const arrays = {
 *       position: { numComponents: 3, data: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0], },
 *       texcoord: { numComponents: 2, data: [0, 0, 0, 1, 1, 0, 1, 1],                 },
 *     };
 *
 *     const bufferInfo = createBufferInfoFromArrays(gl, arrays);
 *
 *     gl.useProgram(programInfo.program);
 *
 * This will automatically bind the buffers AND set the
 * attributes.
 *
 *     setBuffersAndAttributes(gl, programInfo, bufferInfo);
 *
 * For the example above it is equivalent to
 *
 *     gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
 *     gl.enableVertexAttribArray(a_positionLocation);
 *     gl.vertexAttribPointer(a_positionLocation, 3, gl.FLOAT, false, 0, 0);
 *     gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
 *     gl.enableVertexAttribArray(a_texcoordLocation);
 *     gl.vertexAttribPointer(a_texcoordLocation, 4, gl.FLOAT, false, 0, 0);
 *
 * @param {WebGLRenderingContext} gl A WebGLRenderingContext.
 * @param {(module:twgl.ProgramInfo|Object.<string, function>)} setters A `ProgramInfo` as returned from {@link module:twgl.createProgramInfo} or Attribute setters as returned from {@link module:twgl.createAttributeSetters}
 * @param {(module:twgl.BufferInfo|module:twgl.VertexArrayInfo)} buffers a `BufferInfo` as returned from {@link module:twgl.createBufferInfoFromArrays}.
 *   or a `VertexArrayInfo` as returned from {@link module:twgl.createVertexArrayInfo}
 * @memberOf module:twgl/programs
 */
function setBuffersAndAttributes(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfoLike | PublicAttribSetterMap,
  buffers: BufferInfoLike
): void {
  if (buffers.vertexArrayObject) {
    gl.bindVertexArray(buffers.vertexArrayObject);
  } else {
    if (buffers.attribs) {
      setAttributes(((programInfo as ProgramInfoLike).attribSetters || programInfo) as PublicAttribSetterMap, buffers.attribs);
    }
    if (buffers.indices) {
      gl.bindBuffer(ELEMENT_ARRAY_BUFFER, buffers.indices);
    }
  }
}

/**
 * @typedef {Object} ProgramInfo
 * @property {WebGLProgram} program A shader program
 * @property {Object<string, function>} uniformSetters object of setters as returned from createUniformSetters,
 * @property {Object<string, function>} attribSetters object of setters as returned from createAttribSetters,
 * @property {module:twgl.UniformBlockSpec} [uniformBlockSpec] a uniform block spec for making UniformBlockInfos with createUniformBlockInfo etc..
 * @property {Object<string, module:twgl.TransformFeedbackInfo>} [transformFeedbackInfo] info for transform feedbacks
 * @memberOf module:twgl
 */

/**
 * Creates a ProgramInfo from an existing program.
 *
 * A ProgramInfo contains
 *
 *     programInfo = {
 *        program: WebGLProgram,
 *        uniformSetters: object of setters as returned from createUniformSetters,
 *        attribSetters: object of setters as returned from createAttribSetters,
 *     }
 *
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext
 *        to use.
 * @param {WebGLProgram} program an existing WebGLProgram.
 * @return {module:twgl.ProgramInfo} The created ProgramInfo.
 * @memberOf module:twgl/programs
 */
function createProgramInfoFromProgram(gl: WebGL2RenderingContext, program: WebGLProgram): ProgramInfo {
  const uniformSetters = createUniformSetters(gl, program);
  const attribSetters = createAttributeSetters(gl, program);
  const programInfo: ProgramInfo = {
    program,
    uniformSetters,
    attribSetters
  };

  if (utils.isWebGL2(gl)) {
    programInfo.uniformBlockSpec = createUniformBlockSpecFromProgram(gl, program);
    programInfo.transformFeedbackInfo = createTransformFeedbackInfo(gl, program);
  }

  return programInfo;
}

const notIdRE = /\s|{|}|;/;

/**
 * @typedef {Object} ProgramInfo
 * @property {WebGLProgram} program A shader program
 * @property {Object<string, function>} uniformSetters object of setters as returned from createUniformSetters,
 * @property {Object<string, function>} attribSetters object of setters as returned from createAttribSetters,
 * @property {UniformBlockSpec} [uniformBlockSpec] a uniform block spec for making UniformBlockInfos with createUniformBlockInfo etc..
 * @property {Object<string, TransformFeedbackInfo>} [transformFeedbackInfo] info for transform feedbacks
 * @memberOf module:twgl
 */
export type ProgramInfo = {
  program: WebGLProgram;
  uniformSetters: {
    [key: string]: (...params: any[]) => any;
  };
  attribSetters: {
    [key: string]: (...params: any[]) => any;
  };
  uniformBlockSpec?: UniformBlockSpec;
  transformFeedbackInfo?: {
    [key: string]: TransformFeedbackInfo;
  };
};

/**
 * Creates a ProgramInfo from 2 sources.
 *
 * A ProgramInfo contains
 *
 *     programInfo = {
 *        program: WebGLProgram,
 *        uniformSetters: object of setters as returned from createUniformSetters,
 *        attribSetters: object of setters as returned from createAttribSetters,
 *     }
 *
 * NOTE: There are 4 signatures for this function
 *
 *     twgl.createProgramInfo(gl, [vs, fs], options);
 *     twgl.createProgramInfo(gl, [vs, fs], opt_errFunc);
 *     twgl.createProgramInfo(gl, [vs, fs], opt_attribs, opt_errFunc);
 *     twgl.createProgramInfo(gl, [vs, fs], opt_attribs, opt_locations, opt_errFunc);
 *
 * @param {WebGLRenderingContext} gl The WebGLRenderingContext
 *        to use.
 * @param shaderSources - Array of sources for the
 *        shaders or ids. The first is assumed to be the vertex shader,
 *        the second the fragment shader.
 * @param opt_attribs Options for the program or an array of attribs names or an error callback. Locations will be assigned by index if not passed in
 * @param opt_locations The locations for the. A parallel array to opt_attribs letting you assign locations or an error callback.
 * @param opt_errorCallback callback for errors. By default it just prints an error to the console
 *        on error. If you want something else pass an callback. It's passed an error message.
 * @return The created ProgramInfo or null if it failed to link or compile
 */
function createProgramInfo(
  gl: WebGL2RenderingContext,
  shaderSources: string[],
  opt_attribs?: ProgramOptionsArg,
  opt_locations?: number[] | ErrorCallback,
  opt_errorCallback?: ErrorCallback
) : ProgramInfo | null | undefined {
  const progOptions = getProgramOptions(opt_attribs, opt_locations, opt_errorCallback);
  const errors: string[] = [];
  shaderSources = shaderSources.map(function (source) {
    // Lets assume if there is no \n it's an id
    if (!notIdRE.test(source)) {
      const script = getElementById(source) as HTMLScriptElement | null;
      if (!script) {
        const err = `no element with id: ${source}`;
        progOptions.errorCallback(err);
        errors.push(err);
      } else {
        source = script.text;
      }
    }
    return source;
  });

  if (errors.length) {
    return reportError(progOptions, '');
  }

  const origCallback = progOptions.callback;
  if (origCallback) {
    progOptions.callback = (err, program) => {
      origCallback(err, err ? undefined : createProgramInfoFromProgram(gl, program as WebGLProgram));
    };
  }

  const program = createProgramFromSources(gl, shaderSources, progOptions);
  if (!program) {
    return null;
  }

  return createProgramInfoFromProgram(gl, program);
}

function checkAllPrograms(
  gl: WebGL2RenderingContext,
  programs: Record<string, WebGLProgram>,
  programSpecs: ProgramSpecMap,
  noDeleteShadersSet: Set<string | WebGLShader>,
  programOptions: SharedProgramOptions
): string | undefined {
  // check errors for everything.
  for (const [name, program] of Object.entries(programs)) {
    const options: SharedProgramOptions = { ...programOptions };
    const spec = programSpecs[name];
    if (!Array.isArray(spec)) {
      Object.assign(options, spec);
    }
    const errors = getProgramErrors(gl, program, options.errorCallback);
    if (errors) {
      // delete everything we created
      for (const program of Object.values(programs)) {
        const shaders = gl.getAttachedShaders(program) || [];
        gl.deleteProgram(program);
        for (const shader of shaders) {
          // Don't delete it if we didn't create it.
          if (!noDeleteShadersSet.has(shader)) {
            gl.deleteShader(shader);
          }
        }
      }
      return errors;
    }
  }

  return undefined;
}

/**
 * Creates multiple programs
 *
 * Note: the reason this function exists is because the fastest way to create multiple
 * programs in WebGL is to create and compile all shaders and link all programs and only
 * afterwards check if they succeeded. In that way, giving all your shaders
 *
 * @see {@link module:twgl.createProgram}
 *
 * Example:
 *
 *     const programs = twgl.createPrograms(gl, {
 *       lambert: [lambertVS, lambertFS],
 *       phong: [phongVS, phoneFS],
 *       particles: {
 *         shaders: [particlesVS, particlesFS],
 *         transformFeedbackVaryings: ['position', 'velocity'],
 *       },
 *     });
 *
 * @param {WebGLRenderingContext} gl the WebGLRenderingContext
 * @param {Object.<string, module:twgl.ProgramSpec>} programSpecs An object of ProgramSpecs, one per program.
 * @param {module:twgl.ProgramOptions} [programOptions] options to apply to all programs
 * @return {Object.<string, WebGLProgram>?} the created programInfos by name
 */
function createPrograms(
  gl: WebGL2RenderingContext,
  programSpecs: ProgramSpecMap,
  programOptions: SharedProgramOptions = {}
): Record<string, WebGLProgram> | undefined {
  // Remember existing shaders so that if there is an error we don't delete them
  const noDeleteShadersSet = new Set<string | WebGLShader>();

  // compile and link everything
  const programs = Object.fromEntries(
    Object.entries(programSpecs).map(([name, spec]) => {
      const options: SharedProgramOptions = { ...programOptions };
      const shaders = Array.isArray(spec) ? spec : spec.shaders;
      if (!Array.isArray(spec)) {
        Object.assign(options, spec);
      }
      shaders.forEach(noDeleteShadersSet.add, noDeleteShadersSet);
      return [name, createProgramNoCheck(gl, shaders, options)];
    })
  ) as Record<string, WebGLProgram>;

  const callback = programOptions.callback;
  if (callback) {
    waitForAllProgramsLinkCompletionAsync(gl, programs).then(() => {
      const errors = checkAllPrograms(gl, programs, programSpecs, noDeleteShadersSet, programOptions);
      callback(errors, errors ? undefined : programs);
    });
    return undefined;
  }

  const errors = checkAllPrograms(gl, programs, programSpecs, noDeleteShadersSet, programOptions);
  return errors ? undefined : programs;
}

/**
 * Creates multiple programInfos
 *
 * Note: the reason this function exists is because the fastest way to create multiple
 * programs in WebGL is to create and compile all shaders and link all programs and only
 * afterwards check if they succeeded. In that way, giving all your shaders
 *
 * @see {@link module:twgl.createProgramInfo}
 *
 * Examples:
 *
 *     const programInfos = twgl.createProgramInfos(gl, {
 *       lambert: [lambertVS, lambertFS],
 *       phong: [phongVS, phoneFS],
 *       particles: {
 *         shaders: [particlesVS, particlesFS],
 *         transformFeedbackVaryings: ['position', 'velocity'],
 *       },
 *     });
 *
 * or
 *
 *     const {lambert, phong, particles} = twgl.createProgramInfos(gl, {
 *       lambert: [lambertVS, lambertFS],
 *       phong: [phongVS, phoneFS],
 *       particles: {
 *         shaders: [particlesVS, particlesFS],
 *         transformFeedbackVaryings: ['position', 'velocity'],
 *       },
 *     });
 *
 *
 * @param {WebGLRenderingContext} gl the WebGLRenderingContext
 * @param {Object.<string, module:twgl.ProgramSpec>} programSpecs An object of ProgramSpecs, one per program.
 * @param {module:twgl.ProgramOptions} [programOptions] options to apply to all programs
 * @return {Object.<string, module:twgl.ProgramInfo>?} the created programInfos by name
 */
function createProgramInfos(
  gl: WebGL2RenderingContext,
  programSpecs: ProgramSpecMap,
  programOptions?: ProgramOptionsLike
): Record<string, ProgramInfo> | undefined {
  const resolvedProgramOptions = getProgramOptions(programOptions);

  function createProgramInfosForPrograms(
    gl: WebGL2RenderingContext,
    programs: Record<string, WebGLProgram>
  ): Record<string, ProgramInfo> {
    return Object.fromEntries(
      Object.entries(programs).map(([name, program]) => [name, createProgramInfoFromProgram(gl, program)])
    ) as Record<string, ProgramInfo>;
  }

  const origCallback = resolvedProgramOptions.callback;
  if (origCallback) {
    resolvedProgramOptions.callback = (err, programs) => {
      origCallback(err, err ? undefined : createProgramInfosForPrograms(gl, programs as Record<string, WebGLProgram>));
    };
  }

  const programs = createPrograms(gl, programSpecs, resolvedProgramOptions);
  if (origCallback || !programs) {
    return undefined;
  }

  return createProgramInfosForPrograms(gl, programs);
}

/**
 * Creates multiple programs asynchronously
 *
 * @see {@link module:twgl.createProgramAsync}
 *
 * Example:
 *
 *     const programs = await twgl.createProgramsAsync(gl, {
 *       lambert: [lambertVS, lambertFS],
 *       phong: [phongVS, phoneFS],
 *       particles: {
 *         shaders: [particlesVS, particlesFS],
 *         transformFeedbackVaryings: ['position', 'velocity'],
 *       },
 *     });
 *
 * @function
 * @param {WebGLRenderingContext} gl the WebGLRenderingContext
 * @param {Object.<string, module:twgl.ProgramSpec>} programSpecs An object of ProgramSpecs, one per program.
 * @param {module:twgl.ProgramOptions} [programOptions] options to apply to all programs
 * @return {Object.<string, WebGLProgram>?} the created programInfos by name
 */
const createProgramsAsync = wrapCallbackFnToAsyncFn(createPrograms);

/**
 * Creates multiple programInfos asynchronously
 *
 * @see {@link module:twgl.createProgramInfoAsync}
 *
 * Example:
 *
 *     const programInfos = await twgl.createProgramInfosAsync(gl, {
 *       lambert: [lambertVS, lambertFS],
 *       phong: [phongVS, phoneFS],
 *       particles: {
 *         shaders: [particlesVS, particlesFS],
 *         transformFeedbackVaryings: ['position', 'velocity'],
 *       },
 *     });
 *
 * @function
 * @param {WebGLRenderingContext} gl the WebGLRenderingContext
 * @param {Object.<string, module:twgl.ProgramSpec>} programSpecs An object of ProgramSpecs, one per program.
 * @param {module:twgl.ProgramOptions} [programOptions] options to apply to all programs
 * @return {Promise<Object.<string, module:twgl.ProgramInfo>>} the created programInfos by name
 */
const createProgramInfosAsync = wrapCallbackFnToAsyncFn(createProgramInfos);

export {
  bindTransformFeedbackInfo,
  bindUniformBlock,
  createAttributeSetters,
  createProgram,
  createProgramAsync,
  createProgramFromScripts,
  createProgramFromSources,
  createProgramInfo,
  createProgramInfoAsync,
  createProgramInfoFromProgram,
  createProgramInfos,
  createProgramInfosAsync,
  createPrograms,
  createProgramsAsync,
  createTransformFeedback,
  createTransformFeedbackInfo,
  createUniformBlockInfo,
  createUniformBlockInfoFromProgram,
  createUniformBlockSpecFromProgram,
  createUniformSetters,
  setAttributes,
  setBlockUniforms,
  setBuffersAndAttributes,
  setUniformBlock,
  setUniforms,
  setUniformsAndBindTextures
};
