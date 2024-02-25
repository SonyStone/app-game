import { GL_BUFFER_TYPE } from '@packages/webgl/static-variables';
import { IBuffer } from './Buffer';
import { createVAO } from './vao';

export interface IMesh {
  vao: WebGLVertexArrayObject;
  elementCount: number;
  elementType: number;
  instanceCount: number;
  instanced: boolean;
  buffers: Map<string, IBuffer>;
  name: string;
}

export function fromBufferConfig(
  gl: WebGL2RenderingContext,
  config: {
    name: string;
    buffer: IBuffer;
    interleaved?: {
      attrib_loc: number;
      size: number;
      stride_len: number;
      offset: number;
    }[];
    instanced?: boolean;
  }[],
  name: string,
  element_cnt = 0,
  instance_cnt = 0
): IMesh {
  const buffers = new Map();
  let instanced = false;
  let element_type = 0;

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //
  //
  // Basic Configuration
  for (const i of config) {
    buffers.set(i.name, i.buffer); // Save Buffer to Mesh
    if (i.instanced) {
      instanced = true; // Is there instanced Data being used?
    }

    if (i.buffer.type == GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER) {
      // What Data Type is the Element Buffer
      element_type = i.buffer.data_type;
    }
  }

  return {
    name,
    vao: createVAO(gl, config),
    elementCount: element_cnt,
    elementType: element_type,
    instanceCount: instance_cnt,
    instanced,
    buffers
  };
}
