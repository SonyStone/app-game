export function createVertexArray(gl: WebGL2RenderingContext) {
  const vao = gl.createVertexArray();
  const buffers = new Set<WebGLBuffer>();

  return Object.assign(vao!, {
    bind() {
      gl.bindVertexArray(vao);
      return this;
    },
    unbind() {
      gl.bindVertexArray(null);
    },
    delete() {
      gl.deleteVertexArray(vao);
    },
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WebGLRenderingContext/enableVertexAttribArray) */
    attribPointer(attribLocation: number, size: 1 | 2 | 3 | 4, stride: number, offset: number) {
      this.bind();
      gl.enableVertexAttribArray(attribLocation);
      gl.vertexAttribPointer(attribLocation, size, gl.FLOAT, false, stride, offset);
      this.unbind();
      return this;
    },
    addBuffer(buffer: WebGLBuffer) {
      buffers.add(buffer);
      return this;
    }
  });
}
