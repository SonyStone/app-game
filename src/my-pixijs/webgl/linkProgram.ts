export function linkProgram(
  gl: WebGLRenderingContextBase,
  vertShader: WebGLShader,
  fragShader: WebGLShader
): WebGLProgram {
  const program = gl.createProgram()!;

  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);

  gl.linkProgram(program);

  const linkStatus = gl.getProgramParameter(program, gl.LINK_STATUS);

  if (linkStatus) {
    return program;
  } else {
    throw new Error(
      gl.getProgramInfoLog(program) || 'Unknown error creating program object'
    );
  }
}