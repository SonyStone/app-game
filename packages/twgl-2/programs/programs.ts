import { createProgram } from '@packages/webgl/createProgram';
import { createAttributeSetters } from './createAttributeSetters';
import { createUniformBlockSetters } from './createUniformBlockSetters';
import { createUniformSetters } from './createUniformSetters';

export function createProgramInfo(
  gl: WebGL2RenderingContext,
  vertexShaderSource: string,
  fragmentShaderSource: string
) {
  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

  return createProgramInfoFromProgram(gl, program);
}

export function createProgramInfoFromProgram(gl: WebGL2RenderingContext, program: WebGLProgram) {
  const uniformSetters = createUniformSetters(gl, program);
  const uniformBlockSetters = createUniformBlockSetters(gl, program);
  const attribSetters = createAttributeSetters(gl, program);
  const programInfo = {
    program,
    uniformSetters,
    attribSetters,
    uniformBlockSetters,
    uniformLocations: Object.fromEntries(Object.entries(uniformSetters).map(([k, v]) => [k, v.location])),
    attribLocations: Object.fromEntries(Object.entries(attribSetters).map(([k, v]) => [k, v.location]))
  };

  return programInfo;
}
