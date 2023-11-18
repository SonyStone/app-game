/**
 * Copy named properties
 *
 * @param {string[]} names names of properties to copy
 * @param {object} src object to copy properties from
 * @param {object} dst object to copy properties to
 * @private
 */
export function copyNamedProperties(
  names: string[],
  src: { [key: string]: any },
  dst: { [key: string]: any }
) {
  let value: string;
  for (const name of names) {
    value = src[name];
    if (value !== undefined) {
      dst[name] = value;
    }
  }
}

/**
 * Copies properties from source to dest only if a matching key is in dest
 *
 * @param {Object.<string, ?>} src the source
 * @param {Object.<string, ?>} dst the dest
 * @private
 */
export function copyExistingProperties(
  src: { [key: string]: any },
  dst: { [key: string]: any }
) {
  for (const key in dst) {
    if (dst.hasOwnProperty(key) && src.hasOwnProperty(key)) {
      dst[key] = src[key];
    }
  }
}

export function isBuffer(t: WebGLBuffer) {
  return typeof WebGLBuffer !== 'undefined' && t instanceof WebGLBuffer;
}

export function isRenderbuffer(t: WebGLRenderbuffer) {
  return (
    typeof WebGLRenderbuffer !== 'undefined' && t instanceof WebGLRenderbuffer
  );
}

export function isShader(t: WebGLShader) {
  return typeof WebGLShader !== 'undefined' && t instanceof WebGLShader;
}

export function isTexture(t: WebGLTexture) {
  return typeof WebGLTexture !== 'undefined' && t instanceof WebGLTexture;
}

export function isSampler(t: WebGLSampler) {
  return typeof WebGLSampler !== 'undefined' && t instanceof WebGLSampler;
}
