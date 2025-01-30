/**
 * Returns true if attribute/uniform is a reserved/built in
 *
 * It makes no sense to me why GL returns these because it's
 * illegal to call `gl.getUniformLocation` and `gl.getAttribLocation`
 * with names that start with `gl_` (and `webgl_` in WebGL)
 *
 * I can only assume they are there because they might count
 * when computing the number of uniforms/attributes used when you want to
 * know if you are near the limit. That doesn't really make sense
 * to me but the fact that these get returned are in the spec.
 *
 * @param info As returned from `gl.getActiveUniform` or
 *    `gl.getActiveAttrib`.
 * @return true if it's reserved
 */
export function isBuiltIn(info: WebGLActiveInfo): boolean {
  const name = info.name;
  return name.startsWith('gl_') || name.startsWith('webgl_');
}
