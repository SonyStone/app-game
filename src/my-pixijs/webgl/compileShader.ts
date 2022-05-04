export function compileShader(
  gl: WebGLRenderingContextBase,
  shaderType: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(shaderType)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const compileStatus = gl.getShaderParameter(shader, gl.COMPILE_STATUS);

  if (compileStatus) {
    return shader;
  } else {
    throw new Error(
      gl.getShaderInfoLog(shader) || 'Unknown error creating shader'
    );
  }
}
