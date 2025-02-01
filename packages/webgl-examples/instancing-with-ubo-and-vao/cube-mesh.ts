import * as m4 from '@packages/math/m4';
import { createWireframeIndex } from '@packages/paint/paint-1/create-brush-mesh';
import { VertexAttribDivisor, VertexAttribPointer } from './vertex-attrib-pointer';

export const BYTE = 4;

export const CUBE = {
  geometry: {
    target: WebGL2RenderingContext.ARRAY_BUFFER,
    usage: WebGL2RenderingContext.STATIC_DRAW
  },
  // prettier-ignore
  vertex: new Float32Array([
    // position,   normal,      texcoord
     1,  1, -1,    1,  0,  0,   1, 0, // 1
     1,  1,  1,    1,  0,  0,   0, 0,
     1, -1,  1,    1,  0,  0,   0, 1,
     1, -1, -1,    1,  0,  0,   1, 1,
    -1,  1,  1,   -1,  0,  0,   1, 0, // 2
    -1,  1, -1,   -1,  0,  0,   0, 0,
    -1, -1, -1,   -1,  0,  0,   0, 1, 
    -1, -1,  1,   -1,  0,  0,   1, 1,
    -1,  1,  1,    0,  1,  0,   1, 0, // 3
     1,  1,  1,    0,  1,  0,   0, 0,
     1,  1, -1,    0,  1,  0,   0, 1,
    -1,  1, -1,    0,  1,  0,   1, 1,
    -1, -1, -1,    0, -1,  0,   1, 0, // 4
     1, -1, -1,    0, -1,  0,   0, 0,
     1, -1,  1,    0, -1,  0,   0, 1,
    -1, -1,  1,    0, -1,  0,   1, 1,
     1,  1,  1,    0,  0,  1,   1, 0, // 5
    -1,  1,  1,    0,  0,  1,   0, 0,
    -1, -1,  1,    0,  0,  1,   0, 1,
     1, -1,  1,    0,  0,  1,   1, 1,
    -1,  1, -1,    0,  0, -1,   1, 0, // 6
     1,  1, -1,    0,  0, -1,   0, 0,
     1, -1, -1,    0,  0, -1,   0, 1,
    -1, -1, -1,    0,  0, -1,   1, 1,
  ]),
  // prettier-ignore
  vertexAttribPointers: [
    { index: 0, size: 3, type: WebGL2RenderingContext.FLOAT, normalize: false, stride: (3 + 3 + 2) * BYTE, offset: 0 },
    { index: 1, size: 3, type: WebGL2RenderingContext.FLOAT, normalize: false, stride: (3 + 3 + 2) * BYTE, offset: 3 * BYTE },
    { index: 2, size: 2, type: WebGL2RenderingContext.FLOAT, normalize: false, stride: (3 + 3 + 2) * BYTE, offset: (3 + 3) * BYTE }
  ] as VertexAttribPointer[],
  element: {
    target: WebGL2RenderingContext.ELEMENT_ARRAY_BUFFER,
    usage: WebGL2RenderingContext.STATIC_DRAW
  },
  // prettier-ignore
  indices: new Uint16Array([
     0,  1,  2,  0,  2,  3, // side 1
     4,  5,  6,  4,  6,  7, // side 2
     8,  9, 10,  8, 10, 11, // side 3
    12, 13, 14, 12, 14, 15, // side 4
    16, 17, 18, 16, 18, 19, // side 5
    20, 21, 22, 20, 22, 23  // side 6
  ])
};

export const CUBE_WIREFRAME_INDICES = createWireframeIndex(CUBE.indices);

// mat4 + vec3
// stride: 4 + 4 + 4 + 4 + 3
const INSTANCES_STRIDE = 4 * 4 + 3;

export const INSTANCES = {
  instance: {
    target: WebGL2RenderingContext.ARRAY_BUFFER,
    usage: WebGL2RenderingContext.DYNAMIC_DRAW
  },
  instances: (() => {
    const numInstances = 1000000;
    const data = new Float32Array(numInstances * INSTANCES_STRIDE);
    for (let i = 0; i < numInstances; i++) {
      // mat4 position
      m4.identity(data, i * INSTANCES_STRIDE);
      m4.translate(data, [rand(-100, 100), rand(-100, 100), rand(-100, 100)], data, i * INSTANCES_STRIDE);
      const scale = 0.2;
      m4.scale(data, [scale, scale, scale], data, i * INSTANCES_STRIDE);

      // vec3 color
      data[i * INSTANCES_STRIDE + 16] = rand(0, 1);
      data[i * INSTANCES_STRIDE + 17] = rand(0, 1);
      data[i * INSTANCES_STRIDE + 18] = rand(0, 1);
    }

    return { data, numInstances };
  })(),

  // prettier-ignore
  instanceAttribPointers: [
    { index: 4 + 0, size: 4, type: WebGL2RenderingContext.FLOAT, normalize: false, stride: INSTANCES_STRIDE * BYTE, offset: 0 * 4 * BYTE, divisor: 1 },
    { index: 4 + 1, size: 4, type: WebGL2RenderingContext.FLOAT, normalize: false, stride: INSTANCES_STRIDE * BYTE, offset: 1 * 4 * BYTE, divisor: 1 },
    { index: 4 + 2, size: 4, type: WebGL2RenderingContext.FLOAT, normalize: false, stride: INSTANCES_STRIDE * BYTE, offset: 2 * 4 * BYTE, divisor: 1 },
    { index: 4 + 3, size: 4, type: WebGL2RenderingContext.FLOAT, normalize: false, stride: INSTANCES_STRIDE * BYTE, offset: 3 * 4 * BYTE, divisor: 1 },
    { index: 8, size: 3, type: WebGL2RenderingContext.FLOAT, normalize: false, stride: INSTANCES_STRIDE * BYTE, offset: 4 * 4 * BYTE, divisor: 1 },
  ] as (VertexAttribPointer & VertexAttribDivisor)[]
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
