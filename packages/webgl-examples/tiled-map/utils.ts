import { VertexAttribDivisor, VertexAttribPointer } from '../instancing-with-ubo-and-vao/vertex-attrib-pointer';

export function createVertexBuffer(
  gl: WebGL2RenderingContext,
  {
    usage = WebGL2RenderingContext['STATIC_DRAW'],
    vertex = null,
    vertexAttribPointers
  }: {
    usage:
      | WebGL2RenderingContext['STATIC_DRAW']
      | WebGL2RenderingContext['DYNAMIC_DRAW']
      | WebGL2RenderingContext['STREAM_DRAW'];
    vertex: AllowSharedBufferSource | null;
    vertexAttribPointers: VertexAttribPointer[];
  }
) {
  const buffer = gl.createBuffer();
  const target = WebGL2RenderingContext['ARRAY_BUFFER'];
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, vertex, usage);
  for (const point of vertexAttribPointers) {
    gl.enableVertexAttribArray(point.index);
    gl.vertexAttribPointer(point.index, point.size, point.type, point.normalize, point.stride, point.offset);
  }
  return buffer;
}

export function createIndexBuffer(
  gl: WebGL2RenderingContext,
  {
    usage = WebGL2RenderingContext['STATIC_DRAW'],
    indices = null
  }: {
    usage:
      | WebGL2RenderingContext['STATIC_DRAW']
      | WebGL2RenderingContext['DYNAMIC_DRAW']
      | WebGL2RenderingContext['STREAM_DRAW'];
    indices: AllowSharedBufferSource | null;
  }
) {
  const buffer = gl.createBuffer();
  const target = WebGL2RenderingContext['ELEMENT_ARRAY_BUFFER'];
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, indices, usage);
  return buffer;
}

export function createInstanceBuffer(
  gl: WebGL2RenderingContext,
  {
    usage = WebGL2RenderingContext['STATIC_DRAW'],
    instances = null,
    instanceAttribPointers
  }: {
    usage:
      | WebGL2RenderingContext['STATIC_DRAW']
      | WebGL2RenderingContext['DYNAMIC_DRAW']
      | WebGL2RenderingContext['STREAM_DRAW'];
    instances: AllowSharedBufferSource | null;
    instanceAttribPointers: (VertexAttribPointer & VertexAttribDivisor)[];
  }
) {
  const buffer = gl.createBuffer();
  const target = WebGL2RenderingContext['ARRAY_BUFFER'];
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, instances, usage);
  for (const point of instanceAttribPointers) {
    gl.enableVertexAttribArray(point.index);
    gl.vertexAttribPointer(point.index, point.size, point.type, point.normalize, point.stride, point.offset);
    gl.vertexAttribDivisor(point.index, point.divisor);
  }
  return buffer;
}

export const createVao = (gl: WebGL2RenderingContext, setup: () => void) => {
  const vao = gl.createVertexArray();

  if (!vao) {
    throw new Error('Failed to create VAO');
  }

  gl.bindVertexArray(vao);
  setup();
  gl.bindVertexArray(null);

  return vao;
};
