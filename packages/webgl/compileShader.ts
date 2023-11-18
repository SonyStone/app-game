import { GL_STATIC_VARIABLES } from './static-variables';

/**
 * Loads and compiles a shader.
 *
 * Standard function, the same in almost all libraries
 *
 * todo: Add a nicer error output
 * todo: possibly cutting off the first blank lines
 *
 * @param gl The WebGLRenderingContext to use.
 * @param shaderType The type of shader.
 * @param source The shader source.
 * @returns The created shader.
 */
export function compileShader(
  gl: WebGLRenderingContextBase,
  shaderType: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(shaderType)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const compileStatus = gl.getShaderParameter(
    shader,
    GL_STATIC_VARIABLES.COMPILE_STATUS
  );

  if (compileStatus) {
    return shader;
  } else {
    const error = new Error(
      gl.getShaderInfoLog(shader) || 'Unknown error creating shader'
    );

    gl.deleteShader(shader);

    throw error;
  }
}
