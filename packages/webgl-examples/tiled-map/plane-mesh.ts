import * as m3 from '@app-game/math/m3';
import { createWireframeIndex } from '@packages/paint/paint-1/create-brush-mesh';
import { VertexAttribDivisor, VertexAttribPointer } from '../instancing-with-ubo-and-vao/vertex-attrib-pointer';

export const PLANE = {
  target: WebGL2RenderingContext.ARRAY_BUFFER,
  usage: WebGL2RenderingContext.STATIC_DRAW,
  // prettier-ignore
  vertex: new Float32Array([
    // position,   texcoord
       1, -1,      1, 0,
       1,  1,      0, 0,
      -1,  1,      0, 1,
      -1, -1,      1, 1,
    ]),
  // prettier-ignore
  vertexAttribPointers: [
    { index: 0, size: 2, type: WebGL2RenderingContext.FLOAT, normalize: false, stride: (2 + 2) * Float32Array.BYTES_PER_ELEMENT, offset: 0 },
    { index: 1, size: 2, type: WebGL2RenderingContext.FLOAT, normalize: false, stride: (2 + 2) * Float32Array.BYTES_PER_ELEMENT, offset: 2 * Float32Array.BYTES_PER_ELEMENT },
  ] as VertexAttribPointer[],
  // prettier-ignore
  indices: new Uint16Array([
    0,  1,  2,  0,  2,  3,
  ])
};

export const PLANE_WIREFRAME_INDICES = createWireframeIndex(PLANE.indices);

// mat3 + vec3
// stride: 4 + 4 + 4 + 3
const INSTANCES_STRIDE = 4 * 3 + 3;

export const INSTANCES = {
  usage: WebGL2RenderingContext.DYNAMIC_DRAW,
  ...(() => {
    const numInstances = 200000;
    const data = new Float32Array(numInstances * INSTANCES_STRIDE);
    const scale = 50;
    const size = 300;
    for (let i = 0; i < numInstances; i++) {
      m3.identity(data, i * INSTANCES_STRIDE);
      m3.setTranslation(
        data,
        [Math.round(rand(-size, size)) * scale, Math.round(rand(-size, size)) * scale],
        i * INSTANCES_STRIDE
      );
      m3.scale(data, [scale / 2, scale / 2], data, i * INSTANCES_STRIDE);
    }

    return { instances: data, numInstances };
  })(),

  // prettier-ignore
  instanceAttribPointers: [
    { index: 4 + 0, size: 3, type: WebGL2RenderingContext.FLOAT, normalize: false, stride: INSTANCES_STRIDE * Float32Array.BYTES_PER_ELEMENT, offset: 0 * 3 * Float32Array.BYTES_PER_ELEMENT, divisor: 1 },
    { index: 4 + 1, size: 3, type: WebGL2RenderingContext.FLOAT, normalize: false, stride: INSTANCES_STRIDE * Float32Array.BYTES_PER_ELEMENT, offset: 1 * 3 * Float32Array.BYTES_PER_ELEMENT, divisor: 1 },
    { index: 4 + 2, size: 3, type: WebGL2RenderingContext.FLOAT, normalize: false, stride: INSTANCES_STRIDE * Float32Array.BYTES_PER_ELEMENT, offset: 2 * 3 * Float32Array.BYTES_PER_ELEMENT, divisor: 1 },
    { index: 7, size: 3, type: WebGL2RenderingContext.FLOAT, normalize: false, stride: INSTANCES_STRIDE * Float32Array.BYTES_PER_ELEMENT, offset: 4 * 3 * Float32Array.BYTES_PER_ELEMENT, divisor: 1 },
  ] as (VertexAttribPointer & VertexAttribDivisor)[]
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
