import { GL_BUFFER_TYPE, GL_DRAW_ARRAYS_MODE } from '@packages/webgl/static-variables';
import { fromTypeArray } from './Buffer';
import { createVAO } from './vao';

function getWireframeIndex(array: Uint16Array) {
  const indices = [];
  for (let i = 0, l = array.length; i < l; i += 3) {
    const a = array[i + 0];
    const b = array[i + 1];
    const c = array[i + 2];

    indices.push(a, b, b, c, c, a);
  }

  return new Uint16Array(indices);
}

export function createMesh(gl: WebGL2RenderingContext) {
  const indices = new Uint16Array([0, 1, 2, 2, 3, 0]);
  const wireframeIndices = getWireframeIndex(indices);

  const config = [
    {
      name: 'indices',
      buffer: fromTypeArray(gl, GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER, indices, true, true)
    },
    {
      name: 'quad',
      buffer: fromTypeArray(
        gl,
        GL_BUFFER_TYPE.ARRAY_BUFFER,
        new Float32Array([0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 0]),
        true,
        true
      ),
      interleaved: [
        { attrib_loc: 0, size: 3, stride_len: 5 * 4, offset: 0 * 4 },
        { attrib_loc: 2, size: 2, stride_len: 5 * 4, offset: 3 * 4 }
      ]
    }
  ];

  const elementCount = config[0].buffer.length;

  let elementType = 0;
  for (const i of config) {
    if (i.buffer.type == GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER) {
      // What Data Type is the Element Buffer
      elementType = i.buffer.data_type;
    }
  }

  const vao = createVAO(gl, config);

  return {
    draw() {
      gl.drawElements(GL_DRAW_ARRAYS_MODE.TRIANGLES, elementCount, elementType, 0);
      // gl.drawElements(GL_DRAW_ARRAYS_MODE.LINES, element_cnt, element_type, 0);
    },
    bindVertexArray() {
      gl.bindVertexArray(vao);
    },
    clearVertexArray() {
      gl.bindVertexArray(null);
    }
  };
}
