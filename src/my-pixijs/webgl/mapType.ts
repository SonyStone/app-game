import { GL_DATA_TYPE } from "@webgl/static-variables";

export const GL_TO_GLSL_TYPES: { [key: string]: string } = {
  [GL_DATA_TYPE.FLOAT]: "float",
  [GL_DATA_TYPE.FLOAT_VEC2]: "vec2",
  [GL_DATA_TYPE.FLOAT_VEC3]: "vec3",
  [GL_DATA_TYPE.FLOAT_VEC4]: "vec4",

  [GL_DATA_TYPE.INT]: "int",
  [GL_DATA_TYPE.INT_VEC2]: "ivec2",
  [GL_DATA_TYPE.INT_VEC3]: "ivec3",
  [GL_DATA_TYPE.INT_VEC4]: "ivec4",

  [GL_DATA_TYPE.UNSIGNED_INT]: "uint",
  [GL_DATA_TYPE.UNSIGNED_INT_VEC2]: "uvec2",
  [GL_DATA_TYPE.UNSIGNED_INT_VEC3]: "uvec3",
  [GL_DATA_TYPE.UNSIGNED_INT_VEC4]: "uvec4",

  [GL_DATA_TYPE.BOOL]: "bool",
  [GL_DATA_TYPE.BOOL_VEC2]: "bvec2",
  [GL_DATA_TYPE.BOOL_VEC3]: "bvec3",
  [GL_DATA_TYPE.BOOL_VEC4]: "bvec4",

  [GL_DATA_TYPE.FLOAT_MAT2]: "mat2",
  [GL_DATA_TYPE.FLOAT_MAT3]: "mat3",
  [GL_DATA_TYPE.FLOAT_MAT4]: "mat4",

  [GL_DATA_TYPE.SAMPLER_2D]: "sampler2D",
  [GL_DATA_TYPE.INT_SAMPLER_2D]: "isampler2D",
  [GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_2D]: "usampler2D",
  [GL_DATA_TYPE.SAMPLER_CUBE]: "samplerCube",
  [GL_DATA_TYPE.INT_SAMPLER_CUBE]: "isamplerCube",
  [GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_CUBE]: "usamplerCube",
  [GL_DATA_TYPE.SAMPLER_2D_ARRAY]: "sampler2DArray",
  [GL_DATA_TYPE.INT_SAMPLER_2D_ARRAY]: "isampler2DArray",
  [GL_DATA_TYPE.UNSIGNED_INT_SAMPLER_2D_ARRAY]: "usampler2DArray",
};
