import {
  GL_BUFFER_USAGE,
  GL_DRAW_ELEMENTS_TYPE,
} from "@webgl/static-variables";
import { GL_BUFFER_TYPE } from "@webgl/static-variables/buffer";
import { GL_STATIC_VARIABLES } from "@webgl/static-variables/static-variables";
import { TypedArray } from "@webgl/typedArray";

import { Context } from "./Context";

export interface IBuffer {
  /** Buffer GL ID */
  id: WebGLBuffer;

  /** Buffer Type */
  type: GL_BUFFER_TYPE;

  /**  Data Type Used */
  data_type: GL_DRAW_ELEMENTS_TYPE;

  /** Is it static or dynamic */
  usage: GL_BUFFER_USAGE;

  /** number of elements */
  length: number;

  /** Capacity in bytes of the gpu buffer */
  capacity: number;

  /** How Many Bytes Currently Posted to the GPU */
  byte_len: number;

  /** How many Elements make one component, Like Vec3 has 3 */
  component_len: number;

  /** Length of Data chunks, interleaved data. */
  stride_len: number;

  /** Offset of Of Data Chunk, Data Leaved */
  offset: number;
}

export function from_type_array(
  gl: Pick<
    WebGL2RenderingContext,
    "createBuffer" | "bindBuffer" | "bufferData"
  >,
  buf_type: GL_BUFFER_TYPE,
  t_ary?: TypedArray,
  is_static = true,
  unbind = true
): IBuffer {
  const buffer_id = gl.createBuffer()!;
  const usage = is_static
    ? GL_BUFFER_USAGE.STATIC_DRAW
    : GL_BUFFER_USAGE.DYNAMIC_DRAW;

  let data_type = GL_DRAW_ELEMENTS_TYPE.UNSIGNED_INT;

  if (t_ary) {
    gl.bindBuffer(buf_type, buffer_id);
    gl.bufferData(buf_type, t_ary, usage);

    if (unbind) {
      gl.bindBuffer(buf_type, null);
    }

    if (t_ary instanceof Uint16Array) {
      data_type = GL_DRAW_ELEMENTS_TYPE.UNSIGNED_SHORT;
    } else if (t_ary instanceof Uint32Array) {
      data_type = GL_DRAW_ELEMENTS_TYPE.UNSIGNED_INT;
    }
  }

  return {
    id: buffer_id,
    type: buf_type,
    data_type,
    usage,
    length: t_ary?.length ?? 0,
    capacity: t_ary?.byteLength ?? 0,
    byte_len: t_ary?.byteLength ?? 0,
    component_len: 0,
    stride_len: 0,
    offset: 0,
  };
}

export function new_element(
  gl: Pick<
    WebGL2RenderingContext,
    "createBuffer" | "bindBuffer" | "bufferData"
  >,
  t_ary?: TypedArray,
  is_static = true,
  unbind = true
): IBuffer {
  return from_type_array(
    gl,
    GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER,
    t_ary,
    is_static,
    unbind
  );
}

export function new_array(
  gl: Pick<
    WebGL2RenderingContext,
    "createBuffer" | "bindBuffer" | "bufferData"
  >,
  t_ary?: TypedArray,
  comp_len = 3,
  is_static = true,
  unbind = true
) {
  return from_type_array(
    gl,
    GL_BUFFER_TYPE.ARRAY_BUFFER,
    t_ary,
    is_static,
    unbind
  );
}

class BufferFactory {
  constructor(readonly gl: Context) {}

  new_uniform(t_ary?: TypedArray, is_static = true, unbind = true) {
    return from_type_array(
      this.gl.gl,
      GL_BUFFER_TYPE.UNIFORM_BUFFER,
      t_ary,
      is_static,
      unbind
    );
  }
  new_element(t_ary: TypedArray, is_static = true, unbind = true) {
    return from_type_array(
      this.gl.gl,
      GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER,
      t_ary,
      is_static,
      unbind
    );
  }
  new_array(t_ary?: TypedArray, comp_len = 3, is_static = true, unbind = true) {
    let buf = from_type_array(
      this.gl.gl,
      GL_BUFFER_TYPE.ARRAY_BUFFER,
      t_ary,
      is_static,
      unbind
    );
    buf.component_len = comp_len;
    return buf;
  }

  // #region UPDATE
  update_data(buf: any, type_ary: any) {
    let b_len = type_ary.byteLength;
    this.gl.gl.bindBuffer(buf.type, buf.id);

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    if (type_ary instanceof Float32Array)
      buf.data_type = GL_STATIC_VARIABLES.FLOAT;
    else if (type_ary instanceof Uint16Array)
      buf.data_type = GL_STATIC_VARIABLES.UNSIGNED_SHORT;
    else if (type_ary instanceof Uint32Array)
      buf.data_type = GL_STATIC_VARIABLES.UNSIGNED_INT;

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // if the data size is of capacity on the gpu, can set it up as sub data.
    if (b_len <= buf.capacity)
      this.gl.gl.bufferSubData(buf.type, 0, type_ary, 0, undefined);
    else {
      buf.capacity = b_len;
      // if( this.byte_len > 0) gl.ctx.bufferData( this.type, null, gl.ctx.DYNAMIC_DRAW ); // Clean up previus data
      this.gl.gl.bufferData(buf.type, type_ary, buf.usage);
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    this.gl.gl.bindBuffer(buf.type, null); // unbind buffer
    buf.byte_len = b_len;
  }

  /*
	set_dataview( buf, dv, b_start, b_len ){
		this.gl.ctx.bufferData( buf.type, dv, buf.usage, b_start, b_len );
		buf.byte_len = buf.capacity = b_len;
		return this;
	}
	*/
  // #endregion //////////////////////////////////////////////////////////////////////////////////////

  // #region UNBIND
  unbind_array() {
    this.gl.gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, null);
    return this;
  }
  unbind_element() {
    this.gl.gl.bindBuffer(GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER, null);
    return this;
  }
  unbind_uniform() {
    this.gl.gl.bindBuffer(GL_BUFFER_TYPE.UNIFORM_BUFFER, null);
    return this;
  }
  // #endregion //////////////////////////////////////////////////////////////////////////////////////
}
