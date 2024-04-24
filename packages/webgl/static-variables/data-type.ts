import { GL_CONST } from './static-variables';

enum SDF {
  ASDAS
}

/**
 * # Types
 *
 * A shader can aggregate these using arrays and structures to build
 * more complex types. There are no pointer types.
 *
 * # Structures and Arrays
 *
 * * Structures
 * ```glsl
 * struct type-name {
 *    members
 * } struct-name[]; // optional variable declaration,
 *                  // optionally an array
 * ```
 *
 * * Arrays
 * ```glsl
 * float foo[3];
 * ```
 * Structures, blocks, and structure members can be arrays.
 * Only 1-dimensional arrays supported.
 */
export const enum GL_DATA_TYPE {
  // * Basic Types
  /**
   * @param bool Boolean
   */
  BOOL = GL_CONST.BOOL,

  /**
   * @param byte signed byte
   *
   * Mostly using for textures
   */
  BYTE = GL_CONST.BYTE,

  /**
   * @param ubyte unsigned byte
   *
   * Mostly using for textures
   */
  UNSIGNED_BYTE = GL_CONST.UNSIGNED_BYTE,

  /**
   * @param int signed integer
   */
  INT = GL_CONST.INT,

  /**
   * @param uint unsigned integer
   */
  UNSIGNED_INT = GL_CONST.UNSIGNED_INT,

  /**
   *  @param uint unsigned short
   */
  UNSIGNED_SHORT = GL_CONST.UNSIGNED_SHORT,

  /**
   * @param float 16 (or 16 bit int 65535)
   */
  HALF_FLOAT = GL_CONST.HALF_FLOAT,

  /**
   * @param float floating scalar
   */
  FLOAT = GL_CONST.FLOAT,

  // * vectors
  /**
   * @param vec2 2-component floating point vector
   */
  FLOAT_VEC2 = GL_CONST.FLOAT_VEC2,

  /**
   * @param vec3 3-component floating point vector
   */
  FLOAT_VEC3 = GL_CONST.FLOAT_VEC3,

  /**
   * @param vec4 4-component floating point vector
   */
  FLOAT_VEC4 = GL_CONST.FLOAT_VEC4,

  /**
   * @param bvec2 Boolean vector
   */
  BOOL_VEC2 = GL_CONST.BOOL_VEC2,

  /**
   * @param bvec3 Boolean vector
   */
  BOOL_VEC3 = GL_CONST.BOOL_VEC3,

  /**
   * @param bvec4 Boolean vector
   */
  BOOL_VEC4 = GL_CONST.BOOL_VEC4,

  /**
   * @param ivec2 signed integer vector
   */
  INT_VEC2 = GL_CONST.INT_VEC2,

  /**
   * @param ivec3 signed integer vector
   */
  INT_VEC3 = GL_CONST.INT_VEC3,

  /**
   * @param ivec4 signed integer vector
   */
  INT_VEC4 = GL_CONST.INT_VEC4,

  /**
   * @param uvec2 unsigned integer vector
   */
  UNSIGNED_INT_VEC2 = GL_CONST.UNSIGNED_INT_VEC2,

  /**
   * @param uvec3 unsigned integer vector
   */
  UNSIGNED_INT_VEC3 = GL_CONST.UNSIGNED_INT_VEC3,

  /**
   * @param uvec4 unsigned integer vector
   */
  UNSIGNED_INT_VEC4 = GL_CONST.UNSIGNED_INT_VEC4,

  // * mat2
  /**
   * @param mat2 2x2 float matrix
   */
  FLOAT_MAT2 = GL_CONST.FLOAT_MAT2,

  /**
   * @param mat2 2x3 float matrix
   */
  FLOAT_MAT2x3 = GL_CONST.FLOAT_MAT2x3,

  /**
   * @param mat2 2x4 float matrix
   */
  FLOAT_MAT2x4 = GL_CONST.FLOAT_MAT2x4,

  // * mat3
  /**
   * @param mat3 3x2 float matrix
   */
  FLOAT_MAT3x2 = GL_CONST.FLOAT_MAT3x2,

  /**
   * @param mat3 3x3 float matrix
   */
  FLOAT_MAT3 = GL_CONST.FLOAT_MAT3,

  /**
   * @param mat3 3x4 float matrix
   */
  FLOAT_MAT3x4 = GL_CONST.FLOAT_MAT3x4,

  // * mat4
  /**
   * @param mat4 4x4 float matrix
   */
  FLOAT_MAT4x2 = GL_CONST.FLOAT_MAT4x2,

  /**
   * @param mat4 4x4 float matrix
   */
  FLOAT_MAT4x3 = GL_CONST.FLOAT_MAT4x3,

  /**
   * @param mat4 4x4 float matrix
   */
  FLOAT_MAT4 = GL_CONST.FLOAT_MAT4,

  // * Floating Point Sampler Types (opaque)
  /**
   * @param sampler2D access a 2D texture
   */
  SAMPLER_2D = GL_CONST.SAMPLER_2D,

  /**
   * @param sampler3D access a 3D texture
   */
  SAMPLER_3D = GL_CONST.SAMPLER_3D,

  /**
   * @param samplerCube access cube mapped texture
   */
  SAMPLER_CUBE = GL_CONST.SAMPLER_CUBE,

  /**
   * @param samplerCubeShadow access cube map depth texture with comparison
   */
  SAMPLER_CUBE_SHADOW = GL_CONST.SAMPLER_CUBE_SHADOW,

  /**
   * @param sampler2DShadow access 2D array texture
   */
  SAMPLER_2D_SHADOW = GL_CONST.SAMPLER_2D_SHADOW,

  /**
   * @param sampler2DArray access 2D array texture
   */
  SAMPLER_2D_ARRAY = GL_CONST.SAMPLER_2D_ARRAY,

  /**
   * @param sampler2DArrayShadow access 2D array texture
   */
  SAMPLER_2D_ARRAY_SHADOW = GL_CONST.SAMPLER_2D_ARRAY_SHADOW,

  // * Signed Integer Sampler Types (opaque)
  /**
   * @param isampler2D access an integer 2D texture
   */
  INT_SAMPLER_2D = GL_CONST.INT_SAMPLER_2D,

  /**
   * @param isampler3D access an integer 3D texture
   */
  INT_SAMPLER_3D = GL_CONST.INT_SAMPLER_3D,

  /**
   * @param isamplerCube access integer cube mapped texture
   */
  INT_SAMPLER_CUBE = GL_CONST.INT_SAMPLER_CUBE,

  /**
   * @param isampler2DArray access integer 2D array texture
   */
  INT_SAMPLER_2D_ARRAY = GL_CONST.INT_SAMPLER_2D_ARRAY,

  // * Unsigned Integer Sampler Types (opaque)
  /**
   * @param usampler2D access unsigned integer 2D texture
   */
  UNSIGNED_INT_SAMPLER_2D = GL_CONST.UNSIGNED_INT_SAMPLER_2D,

  /**
   * @param usampler3D access unsigned integer 3D texture
   */
  UNSIGNED_INT_SAMPLER_3D = GL_CONST.UNSIGNED_INT_SAMPLER_3D,

  /**
   * @param usamplerCube access unsigned integer cube mapped texture
   */
  UNSIGNED_INT_SAMPLER_CUBE = GL_CONST.UNSIGNED_INT_SAMPLER_CUBE,

  /**
   * @param usampler2DArray access unsigned integer 2D array texture
   */
  UNSIGNED_INT_SAMPLER_2D_ARRAY = GL_CONST.UNSIGNED_INT_SAMPLER_2D_ARRAY
}
