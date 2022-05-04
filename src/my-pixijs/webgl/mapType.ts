import type { Dict } from '@pixi/utils';

let GL_TABLE: { [key: string]: string };

/**
5124: "int"
5125: "uint"
5126: "float"
35664: "vec2"
35665: "vec3"
35666: "vec4"
35667: "ivec2"
35668: "ivec3"
35669: "ivec4"
35670: "bool"
35671: "bvec2"
35672: "bvec3"
35673: "bvec4"
35674: "mat2"
35675: "mat3"
35676: "mat4"
35678: "sampler2D"
35680: "samplerCube"
36289: "sampler2DArray"
36294: "uvec2"
36295: "uvec3"
36296: "uvec4"
36298: "sampler2D"
36300: "samplerCube"
36303: "sampler2DArray"
36306: "sampler2D"
36308: "samplerCube"
36311: "sampler2DArray"
 */

const GL_TO_GLSL_TYPES: Dict<string> = {
  FLOAT: 'float',
  FLOAT_VEC2: 'vec2',
  FLOAT_VEC3: 'vec3',
  FLOAT_VEC4: 'vec4',

  INT: 'int',
  INT_VEC2: 'ivec2',
  INT_VEC3: 'ivec3',
  INT_VEC4: 'ivec4',

  UNSIGNED_INT: 'uint',
  UNSIGNED_INT_VEC2: 'uvec2',
  UNSIGNED_INT_VEC3: 'uvec3',
  UNSIGNED_INT_VEC4: 'uvec4',

  BOOL: 'bool',
  BOOL_VEC2: 'bvec2',
  BOOL_VEC3: 'bvec3',
  BOOL_VEC4: 'bvec4',

  FLOAT_MAT2: 'mat2',
  FLOAT_MAT3: 'mat3',
  FLOAT_MAT4: 'mat4',

  SAMPLER_2D: 'sampler2D',
  INT_SAMPLER_2D: 'sampler2D',
  UNSIGNED_INT_SAMPLER_2D: 'sampler2D',
  SAMPLER_CUBE: 'samplerCube',
  INT_SAMPLER_CUBE: 'samplerCube',
  UNSIGNED_INT_SAMPLER_CUBE: 'samplerCube',
  SAMPLER_2D_ARRAY: 'sampler2DArray',
  INT_SAMPLER_2D_ARRAY: 'sampler2DArray',
  UNSIGNED_INT_SAMPLER_2D_ARRAY: 'sampler2DArray',
};

export function mapType(gl: any, type: number): string {
  if (!GL_TABLE) {
    const typeNames = Object.keys(GL_TO_GLSL_TYPES);

    GL_TABLE = {};

    for (let i = 0; i < typeNames.length; ++i) {
      const tn = typeNames[i];

      GL_TABLE[gl[tn]] = GL_TO_GLSL_TYPES[tn];
    }
  }

  return GL_TABLE[type];
}
