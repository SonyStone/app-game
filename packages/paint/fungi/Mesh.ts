import { GL_BUFFER_TYPE } from "@webgl/static-variables";
import { IBuffer } from "./Buffer";
import { create_vao } from "./Vao";

export interface IMesh {
  vao: WebGLVertexArrayObject;
  element_cnt: number;
  element_type: number;
  instance_cnt: number;
  instanced: boolean;
  buffers: Map<string, IBuffer>;
  name: string;
}

export function from_buffer_config(
  gl: Pick<
    WebGL2RenderingContext,
    | "createVertexArray"
    | "bindVertexArray"
    | "bindBuffer"
    | "enableVertexAttribArray"
    | "vertexAttribPointer"
    | "vertexAttribDivisor"
  >,
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
    vao: create_vao(gl, config),
    element_cnt,
    element_type,
    instance_cnt,
    instanced,
    buffers,
  };
}
