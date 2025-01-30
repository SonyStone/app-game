import { GL_DATA_TYPE } from '@packages/webgl/static-variables';
import { GL_TEXTURE_TARGET, GL_TEXTURE_UNIT } from '@packages/webgl/static-variables/textures';

// prettier-ignore
export const typeMap = {
  [GL_DATA_TYPE.FLOAT]:                          { Type: Float32Array, size: 4, setter: floatSetter, arraySetter: floatArraySetter },
  [GL_DATA_TYPE.FLOAT_VEC2]:                     { Type: Float32Array, size: 8, setter: floatVec2Setter, cols: 2 },
  [GL_DATA_TYPE.FLOAT_VEC3]:                     { Type: Float32Array, size: 12, setter: floatVec3Setter, cols: 3 },
  [GL_DATA_TYPE.FLOAT_VEC4]:                     { Type: Float32Array, size: 16, setter: floatVec4Setter, cols: 4 },
  [GL_DATA_TYPE.INT]:                            { Type: Int32Array, size: 4, setter: intSetter, arraySetter: intArraySetter },
  [GL_DATA_TYPE.INT_VEC2]:                       { Type: Int32Array, size: 8, setter: intVec2Setter, cols: 2 },
  [GL_DATA_TYPE.INT_VEC3]:                       { Type: Int32Array, size: 12, setter: intVec3Setter, cols: 3 },
  [GL_DATA_TYPE.INT_VEC4]:                       { Type: Int32Array, size: 16, setter: intVec4Setter, cols: 4 },
  [GL_DATA_TYPE.UNSIGNED_INT]:                   { Type: Uint32Array, size: 4, setter: uintSetter, arraySetter: uintArraySetter },
  [GL_DATA_TYPE.UNSIGNED_INT_VEC2]:              { Type: Uint32Array, size: 8, setter: uintVec2Setter, cols: 2 },
  [GL_DATA_TYPE.UNSIGNED_INT_VEC3]:              { Type: Uint32Array, size: 12, setter: uintVec3Setter, cols: 3 },
  [GL_DATA_TYPE.UNSIGNED_INT_VEC4]:              { Type: Uint32Array, size: 16, setter: uintVec4Setter, cols: 4 },
  [GL_DATA_TYPE.BOOL]:                           { Type: Uint32Array, size: 4, setter: intSetter, arraySetter: intArraySetter },
  [GL_DATA_TYPE.BOOL_VEC2]:                      { Type: Uint32Array, size: 8, setter: intVec2Setter, cols: 2 },
  [GL_DATA_TYPE.BOOL_VEC3]:                      { Type: Uint32Array, size: 12, setter: intVec3Setter, cols: 3 },
  [GL_DATA_TYPE.BOOL_VEC4]:                      { Type: Uint32Array, size: 16, setter: intVec4Setter, cols: 4 },
  [GL_DATA_TYPE.FLOAT_MAT2]:                     { Type: Float32Array, size: 32, setter: floatMat2Setter, rows: 2, cols: 2 },
  [GL_DATA_TYPE.FLOAT_MAT3]:                     { Type: Float32Array, size: 48, setter: floatMat3Setter, rows: 3, cols: 3 },
  [GL_DATA_TYPE.FLOAT_MAT4]:                     { Type: Float32Array, size: 64, setter: floatMat4Setter, rows: 4, cols: 4 },
  [GL_DATA_TYPE.FLOAT_MAT2x3]:                   { Type: Float32Array, size: 32, setter: floatMat23Setter, rows: 2, cols: 3 },
  [GL_DATA_TYPE.FLOAT_MAT2x4]:                   { Type: Float32Array, size: 32, setter: floatMat24Setter, rows: 2, cols: 4 },
  [GL_DATA_TYPE.FLOAT_MAT3x2]:                   { Type: Float32Array, size: 48, setter: floatMat32Setter, rows: 3, cols: 2 },
  [GL_DATA_TYPE.FLOAT_MAT3x4]:                   { Type: Float32Array, size: 48, setter: floatMat34Setter, rows: 3, cols: 4 },
  [GL_DATA_TYPE.FLOAT_MAT4x2]:                   { Type: Float32Array, size: 64, setter: floatMat42Setter, rows: 4, cols: 2 },
  [GL_DATA_TYPE.FLOAT_MAT4x3]:                   { Type: Float32Array, size: 64, setter: floatMat43Setter, rows: 4, cols: 3 },
  [GL_DATA_TYPE.SAMPLER_2D]:                     { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_2D },
  [GL_DATA_TYPE.SAMPLER_CUBE]:                   { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_CUBE_MAP },
  [GL_DATA_TYPE.SAMPLER_3D]:                     { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_3D },
  [GL_DATA_TYPE.SAMPLER_2D_SHADOW]:              { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_2D },
  [GL_DATA_TYPE.SAMPLER_2D_ARRAY]:               { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_2D_ARRAY },
  [GL_DATA_TYPE.SAMPLER_2D_ARRAY_SHADOW]:        { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_2D_ARRAY },
  [GL_DATA_TYPE.SAMPLER_CUBE_SHADOW]:            { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_CUBE_MAP },
  [GL_DATA_TYPE.INT_SAMPLER_2D]:                 { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_2D },
  [GL_DATA_TYPE.INT_SAMPLER_3D]:                 { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_3D },
  [GL_DATA_TYPE.INT_SAMPLER_CUBE]:               { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_CUBE_MAP },
  [GL_DATA_TYPE.INT_SAMPLER_2D_ARRAY]:           { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_2D_ARRAY },
  [GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_2D]:        { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_2D },
  [GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_3D]:        { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_3D },
  [GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_CUBE]:      { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_CUBE_MAP },
  [GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_2D_ARRAY]:  { Type: null, size: 0, setter: samplerSetter, arraySetter: samplerArraySetter, bindPoint: GL_TEXTURE_TARGET.TEXTURE_2D_ARRAY }
} as const;

export type TypeMap = typeof typeMap;
export type TypeMapKeys = keyof TypeMap;
export type TypeInfo = TypeMap[TypeMapKeys];

export type SamplerTypeMap = Pick<typeof typeMap, SamplerTypeMapKeys>;
export type SamplerTypeMapKeys = Extract<
  TypeMapKeys,
  | GL_DATA_TYPE.SAMPLER_2D
  | GL_DATA_TYPE.SAMPLER_2D_ARRAY
  | GL_DATA_TYPE.SAMPLER_2D_ARRAY_SHADOW
  | GL_DATA_TYPE.SAMPLER_2D_SHADOW
  | GL_DATA_TYPE.SAMPLER_3D
  | GL_DATA_TYPE.SAMPLER_CUBE
  | GL_DATA_TYPE.SAMPLER_CUBE_SHADOW
  | GL_DATA_TYPE.INT_SAMPLER_2D
  | GL_DATA_TYPE.INT_SAMPLER_2D_ARRAY
  | GL_DATA_TYPE.INT_SAMPLER_3D
  | GL_DATA_TYPE.INT_SAMPLER_CUBE
  | GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_2D
  | GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_3D
  | GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_CUBE
  | GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_2D_ARRAY
>;
export type SamplerTypeInfo = SamplerTypeMap[SamplerTypeMapKeys];

export type ArrayTypeMap = Pick<typeof typeMap, ArrayTypeMapKeys>;
export type ArrayTypeMapKeys = Extract<
  TypeMapKeys,
  GL_DATA_TYPE.FLOAT | GL_DATA_TYPE.INT | GL_DATA_TYPE.UNSIGNED_INT | GL_DATA_TYPE.BOOL
>;
export type ArrayTypeInfo = ArrayTypeMap[ArrayTypeMapKeys];

// all the possible setters
export type Setter = ReturnType<TypeInfo['setter'] | SamplerTypeInfo['arraySetter'] | ArrayTypeInfo['arraySetter']>;

function floatSetter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: number) {
    gl.uniform1f(location, v);
  };
}

function floatArraySetter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform1fv(location, v);
  };
}

function floatVec2Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform2fv(location, v);
  };
}

function floatVec3Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform3fv(location, v);
  };
}

function floatVec4Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform4fv(location, v);
  };
}

function intSetter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: number) {
    gl.uniform1i(location, v);
  };
}

function intArraySetter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform1iv(location, v);
  };
}

function intVec2Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform2iv(location, v);
  };
}

function intVec3Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform3iv(location, v);
  };
}

function intVec4Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform4iv(location, v);
  };
}

function uintSetter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: number) {
    gl.uniform1ui(location, v);
  };
}

function uintArraySetter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform1uiv(location, v);
  };
}

function uintVec2Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform2uiv(location, v);
  };
}

function uintVec3Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform3uiv(location, v);
  };
}

function uintVec4Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniform4uiv(location, v);
  };
}

function floatMat2Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix2fv(location, false, v);
  };
}

function floatMat3Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix3fv(location, false, v);
  };
}

function floatMat4Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix4fv(location, false, v);
  };
}

function floatMat23Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix2x3fv(location, false, v);
  };
}

function floatMat32Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix3x2fv(location, false, v);
  };
}

function floatMat24Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix2x4fv(location, false, v);
  };
}

function floatMat42Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix4x2fv(location, false, v);
  };
}

function floatMat34Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix3x4fv(location, false, v);
  };
}

function floatMat43Setter(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
  return function (v: Iterable<number>) {
    gl.uniformMatrix4x3fv(location, false, v);
  };
}

type TexturePair = { texture: WebGLTexture; sampler: WebGLSampler };

function samplerSetter(
  gl: WebGL2RenderingContext,
  type: SamplerTypeMapKeys,
  unit: number,
  location: WebGLUniformLocation
) {
  const bindPoint = getBindPointForSamplerType(type);
  return function (textureOrPair: WebGLTexture | TexturePair) {
    const texture = (textureOrPair as TexturePair).texture ?? textureOrPair;
    const sampler = (textureOrPair as TexturePair).sampler ?? null;

    gl.uniform1i(location, unit);
    gl.activeTexture(GL_TEXTURE_UNIT.TEXTURE0 + unit);
    gl.bindTexture(bindPoint, texture);
    gl.bindSampler(unit, sampler);
  };
}

function samplerArraySetter(
  gl: WebGL2RenderingContext,
  type: SamplerTypeMapKeys,
  unit: number,
  location: WebGLUniformLocation,
  size: number
) {
  const bindPoint = getBindPointForSamplerType(type);
  const units = new Int32Array(size);
  for (let ii = 0; ii < size; ++ii) {
    units[ii] = unit + ii;
  }

  return function (textures: (WebGLTexture | TexturePair)[]) {
    gl.uniform1iv(location, units);
    for (let index = 0; index < textures.length; ++index) {
      const textureOrPair = textures[index];
      gl.activeTexture(GL_TEXTURE_UNIT.TEXTURE0 + units[index]);
      const texture = (textureOrPair as TexturePair).texture ?? textureOrPair;
      const sampler = (textureOrPair as TexturePair).sampler ?? null;
      gl.bindSampler(unit, sampler);
      gl.bindTexture(bindPoint, texture);
    }
  };
}

/**
 * Returns the corresponding bind point for a given sampler type
 * @private
 */
function getBindPointForSamplerType(type: SamplerTypeMapKeys) {
  return typeMap[type].bindPoint;
}
