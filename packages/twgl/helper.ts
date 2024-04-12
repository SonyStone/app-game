/**
 * Copy named properties
 *
 * @param {string[]} names names of properties to copy
 * @param {object} src object to copy properties from
 * @param {object} dst object to copy properties to
 * @private
 */
export function copyNamedProperties(names: string[], src: { [key: string]: any }, dst: { [key: string]: any }): void {
  names.forEach(function (name) {
    const value = src[name];
    if (value !== undefined) {
      dst[name] = value;
    }
  });
}

/**
 * Copies properties from source to dest only if a matching key is in dest
 *
 * @param {Object.<string, ?>} src the source
 * @param {Object.<string, ?>} dst the dest
 * @private
 */
export function copyExistingProperties(src: { [key: string]: any }, dst: { [key: string]: any }): void {
  Object.keys(dst).forEach(function (key) {
    if (dst.hasOwnProperty(key) && src.hasOwnProperty(key)) {
      /* eslint no-prototype-builtins: 0 */
      dst[key] = src[key];
    }
  });
}

export function error(...args: any) {
  console.error(...args);
}

export function warn(...args: any) {
  console.warn(...args);
}

const isTypeWeakMaps = new Map();

function isType<T>(object: T, type: string): object is T {
  if (!object || typeof object !== 'object') {
    return false;
  }
  let weakMap = isTypeWeakMaps.get(type);
  if (!weakMap) {
    weakMap = new WeakMap();
    isTypeWeakMaps.set(type, weakMap);
  }
  let isOfType = weakMap.get(object);
  if (isOfType === undefined) {
    const s = Object.prototype.toString.call(object);
    isOfType = s.substring(8, s.length - 1) === type;
    weakMap.set(object, isOfType);
  }
  return isOfType;
}

export function isBuffer(gl: WebGL2RenderingContext, t: unknown): t is WebGLBuffer {
  return typeof WebGLBuffer !== 'undefined' && isType(t, 'WebGLBuffer');
}

export function isRenderbuffer(gl: WebGL2RenderingContext, t: unknown): t is WebGLBuffer {
  return typeof WebGLRenderbuffer !== 'undefined' && isType(t, 'WebGLRenderbuffer');
}

export function isShader(gl: WebGL2RenderingContext, t: unknown): t is WebGLShader {
  return typeof WebGLShader !== 'undefined' && isType(t, 'WebGLShader');
}

export function isTexture(gl: WebGL2RenderingContext, t: unknown): t is WebGLTexture {
  return typeof WebGLTexture !== 'undefined' && isType(t, 'WebGLTexture');
}

export function isSampler(gl: WebGL2RenderingContext, t: unknown): t is WebGLSampler {
  return typeof WebGLSampler !== 'undefined' && isType(t, 'WebGLSampler');
}
