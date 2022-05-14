import {
  GL_DATA_TYPE,
  GL_STATIC_VARIABLES,
} from '../../twgl/webgl-static-variables';
import { mapSize } from './mapSize';
import { GL_TO_GLSL_TYPES } from './mapType';

export interface AttributeData {
  type: string;
  size: number;
  location: number;
  name: string;
}

/**
 * returns the attribute data from the program
 * @private
 *
 * @param {WebGLProgram} [program] - the WebGL program
 * @param {WebGL2RenderingContext} [gl] - the WebGL context
 *
 * @returns {object} the attribute data for this program
 */
export function getAttributeData(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): { [key: string]: AttributeData } {
  const attributes: { [key: string]: AttributeData } = {};

  const totalAttributes = gl.getProgramParameter(
    program,
    GL_STATIC_VARIABLES.ACTIVE_ATTRIBUTES
  );

  function getActiveAttribData(program: WebGLProgram, i: number) {
    const attribData = gl.getActiveAttrib(program, i)!;

    if (attribData.name.indexOf('gl_') === 0) {
      return undefined;
    }

    const type = GL_TO_GLSL_TYPES[attribData.type as GL_DATA_TYPE];
    return {
      type,
      name: attribData.name,
      size: mapSize(type),
      location: gl.getAttribLocation(program, attribData.name),
    };
  }

  for (let i = 0; i < totalAttributes; i++) {
    const attrib = getActiveAttribData(program, i);

    if (attrib) {
      attributes[attrib.name] = attrib;
    }
  }

  return attributes;
}
