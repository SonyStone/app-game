export type ExtWebGLProgram = WebGLProgram & {
  attributes?: { [key: string]: number },
  uniforms?: { [key: string]: WebGLUniformLocation }
}

export function createProgram(gl: WebGLRenderingContext, vid: string, fid: string, defines?: string): ExtWebGLProgram | undefined {
  var vshader = compileShaderFromString(gl, vid, gl.VERTEX_SHADER, defines);
  var fshader = compileShaderFromString(gl, fid, gl.FRAGMENT_SHADER, defines);

  if (vshader == null || fshader == null) {
    return;
  }

  const program: ExtWebGLProgram = gl.createProgram()!;
  gl.attachShader(program, vshader);
  gl.attachShader(program, fshader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.log("Could not link program for shaders " + vid + " and " + fid + ": " + gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return;
  }

  //var translatedSource = gl.getExtension("WEBGL_debug_shaders").getTranslatedShaderSource(fshader);

  var nattrib = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

  program.attributes = {};

  for (var i = 0; i < nattrib; i++) {
    var name = gl.getActiveAttrib(program, i)!.name;
    program.attributes[name] = gl.getAttribLocation(program, name);
  }

  var nuniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);

  program.uniforms = {};
  for (var i = 0; i < nuniforms; i++) {
    var name = gl.getActiveUniform(program, i)!.name;
    program.uniforms[name] = gl.getUniformLocation(program, name)!;
  }

  return program;
}

export function compileShaderFromString(gl: WebGLRenderingContext, src: string, shaderType: number, defines?: string): WebGLShader | undefined {
  if (defines != null) {
    src = src.replace("//insertdefines", defines);
  }

  const shader = gl.createShader(shaderType)!;

  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.log("Failed to compile shader:\n" + gl.getShaderInfoLog(shader));
    return;
  }
  return shader;
}
