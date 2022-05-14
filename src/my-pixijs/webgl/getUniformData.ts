import {
  GL_DATA_TYPE,
  GL_STATIC_VARIABLES,
} from '../../twgl/webgl-static-variables';
import { defaultValue } from './defaultValue';
import { GL_TO_GLSL_TYPES } from './mapType';
import { getUniformsSetter } from './uniformsSetters';

export interface UniformData {
  index: number;
  type: string;
  size: number;
  isArray: boolean;
  isStruct: boolean;
  value:
    | number
    | boolean
    | number[]
    | boolean[]
    | Float32Array
    | Int32Array
    | Uint32Array;
  name: string;
  location: WebGLUniformLocation;
  set(
    v:
      | number
      | boolean
      | number[]
      | boolean[]
      | Float32Array
      | Int32Array
      | Uint32Array
  ): void;
}

/**
 * returns the uniform data from the program
 * @private
 *
 * @param program - the webgl program
 * @param gl - the WebGL context
 *
 * @returns {object} the uniform data for this program
 */
export function getUniformData(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): { [key: string]: UniformData } {
  const uniforms: { [key: string]: UniformData } = {};

  const totalUniforms = gl.getProgramParameter(
    program,
    GL_STATIC_VARIABLES.ACTIVE_UNIFORMS
  );

  function getActiveUniformData(program: WebGLProgram, i: number) {
    const uniformData = gl.getActiveUniform(program, i)!;
    const name = uniformData.name.replace(/\[.*?\]$/, '');
    const isArray = !!uniformData.name.match(/\[.*?\]$/);
    const isStruct = !!uniformData.name.match(/\./);
    const type = GL_TO_GLSL_TYPES[uniformData.type as GL_DATA_TYPE];
    const location = gl.getUniformLocation(program, name)!;

    return {
      name,
      index: i,
      type,
      size: uniformData.size,
      isArray,
      isStruct,
      value: defaultValue(uniformData.type, uniformData.size),
      location,
      set: getUniformsSetter(gl, uniformData.type as GL_DATA_TYPE, location),
    };
  }

  for (let i = 0; i < totalUniforms; i++) {
    const uniform = getActiveUniformData(program, i);
    uniforms[uniform.name] = uniform;
  }

  return uniforms;
}
