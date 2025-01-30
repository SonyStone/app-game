import { compileShader } from './compileShader';
import { GL_SHADER_TYPE } from './static-variables';

/**
 * Simple create program function, without any insert `#define`s or `#include`s
 */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertexShaderSource: string,
  fragmentShaderSource: string
): WebGLProgram {
  const vs = compileShader(gl, GL_SHADER_TYPE.VERTEX_SHADER, vertexShaderSource);
  const fs = compileShader(gl, GL_SHADER_TYPE.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Could not link program:\n${info}`);
  }
  return program;
}
