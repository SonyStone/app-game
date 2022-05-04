import { Geometry } from './geometry';
import { AttributeData } from './getAttributeData';

export function setVertexArrayObject(
  gl: WebGL2RenderingContext,
  attributeData: {
    [key: string]: AttributeData;
  },
  geometry: Geometry
) {
  const vao = gl.createVertexArray();

  gl.bindVertexArray(vao);

  const { buffers, attributes } = geometry;

  const gl_buffers: WebGLBuffer[] = [];

  for (const buffer of buffers) {
    const gl_buffer = gl.createBuffer()!;
    gl.bindBuffer(buffer.type, gl_buffer);
    gl.bufferData(buffer.type, buffer.data, buffer.usage);

    gl_buffers.push(gl_buffer);
  }

  for (const key in attributes) {
    const attribute = attributes[key];

    if (attributeData[key]) {
      const location = attributeData[key].location;
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(
        location,
        attribute.size,
        attribute.type,
        attribute.normalized,
        attribute.stride,
        attribute.start
      );
    }
  }

  return {
    destroy(): void {
      for (const gl_buffer of gl_buffers) {
        gl.deleteBuffer(gl_buffer);
      }
    },
  };
}
