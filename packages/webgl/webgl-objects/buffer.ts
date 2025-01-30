import type { WebGLRenderingContextStrict } from '../webgl-strict-types/webgl';

export function createBuffer(
  gl: WebGL2RenderingContext,
  {
    target,
    usage
  }: {
    target: WebGLRenderingContextStrict.BufferTarget;
    usage: WebGLRenderingContextStrict.BufferDataUsage;
  }
) {
  let buffer = gl.createBuffer();

  return {
    buffer,
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindBuffer) */
    bind() {
      if (buffer) {
        gl.bindBuffer(target, buffer);
      }
      return this;
    },

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bindBuffer) */
    unbind() {
      gl.bindBuffer(target, null);
    },

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/bufferData) */
    data(data: ArrayBufferView) {
      this.bind();
      gl.bufferData(target, data, usage);
      this.unbind();
      return this;
    },

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/deleteBuffer) */
    delete() {
      if (buffer) {
        gl.deleteBuffer(buffer);
        buffer = null;
      }
    },

    /** Returns the size of the buffer in bytes. */
    getSize() {
      this.bind();
      const size = gl.getBufferParameter(target, gl.BUFFER_SIZE);
      this.unbind();
      return size;
    },

    /** Returns GL_BUFFER_USAGE the usage pattern of the buffer */
    getUsage() {
      return usage;
    },

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGL2RenderingContext/getBufferSubData) */
    getSubData(data: ArrayBufferView) {
      this.bind();
      gl.getBufferSubData(target, 0, data);
      this.unbind();
      return data;
    }
  };
}
