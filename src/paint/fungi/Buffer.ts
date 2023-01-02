import {
  GL_BUFFER_USAGE,
  GL_DATA_TYPE,
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

class Buffer implements IBuffer {
  // #region MAIN
  id: WebGLBuffer; // Buffer GL ID
  type: GL_BUFFER_TYPE; // Buffer Type
  data_type: GL_DRAW_ELEMENTS_TYPE = GL_DRAW_ELEMENTS_TYPE.UNSIGNED_INT; // Data Type Used
  usage: GL_BUFFER_USAGE = 0; // Is it static or dynamic
  capacity = 0; // Capacity in bytes of the gpu buffer
  byte_len = 0; // How Many Bytes Currently Posted to the GPU
  component_len = 0; // How many Elements make one component, Like Vec3 has 3.

  //interleaved     = null;
  stride_len = 0; // Length of Data chunks, interleaved data.
  offset = 0; // Offset of Of Data Chunk, Data Leaved

  constructor(id: WebGLBuffer, type: GL_BUFFER_TYPE, is_static = true) {
    this.id = id;
    this.type = type;
    this.usage = is_static
      ? GL_BUFFER_USAGE.STATIC_DRAW
      : GL_BUFFER_USAGE.DYNAMIC_DRAW;
  }
  // #endregion //////////////////////////////////////////////////////////////////////////////////////
}

function create_buffer_store(
  id: WebGLBuffer,
  type: GL_BUFFER_TYPE,
  is_static = true
): IBuffer {
  return {
    id,
    type,
    data_type: GL_DRAW_ELEMENTS_TYPE.UNSIGNED_INT,
    usage: is_static
      ? GL_BUFFER_USAGE.STATIC_DRAW
      : GL_BUFFER_USAGE.DYNAMIC_DRAW,
    capacity: 0,
    byte_len: 0,
    component_len: 0,
    stride_len: 0,
    offset: 0,
  };
}

export function from_type_array(
  ctx: WebGL2RenderingContext,
  buf_type: GL_BUFFER_TYPE,
  t_ary?: TypedArray,
  is_static = true,
  unbind = true
): IBuffer {
  const buffer_id = ctx.createBuffer()!;
  const usage = is_static
    ? GL_BUFFER_USAGE.STATIC_DRAW
    : GL_BUFFER_USAGE.DYNAMIC_DRAW;

  let data_type = GL_DRAW_ELEMENTS_TYPE.UNSIGNED_INT;

  if (t_ary) {
    ctx.bindBuffer(buf_type, buffer_id);
    ctx.bufferData(buf_type, t_ary, usage);

    if (unbind) {
      ctx.bindBuffer(buf_type, null);
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
    capacity: t_ary?.byteLength ?? 0,
    byte_len: t_ary?.byteLength ?? 0,
    component_len: 0,
    stride_len: 0,
    offset: 0,
  };
}

export function new_element(
  ctx: WebGL2RenderingContext,
  t_ary?: TypedArray,
  is_static = true,
  unbind = true
): IBuffer {
  return from_type_array(
    ctx,
    GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER,
    t_ary,
    is_static,
    unbind
  );
}

export function new_array(
  ctx: WebGL2RenderingContext,
  t_ary?: TypedArray,
  comp_len = 3,
  is_static = true,
  unbind = true
) {
  const buf_type = GL_BUFFER_TYPE.ARRAY_BUFFER;
  const buffer_id = ctx.createBuffer()!; //!
  const usage = is_static
    ? GL_BUFFER_USAGE.STATIC_DRAW
    : GL_BUFFER_USAGE.DYNAMIC_DRAW;

  let data_type = GL_DRAW_ELEMENTS_TYPE.UNSIGNED_INT;

  if (t_ary) {
    ctx.bindBuffer(buf_type, buffer_id); // !
    ctx.bufferData(buf_type, t_ary, usage); // !

    if (unbind) {
      ctx.bindBuffer(buf_type, null); // !
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
    capacity: t_ary?.byteLength ?? 0,
    byte_len: t_ary?.byteLength ?? 0,
    component_len: comp_len,
    stride_len: 0,
    offset: 0,
  };
}

class BufferFactory {
  constructor(readonly gl: Context) {}

  from_bin(
    buf_type: GL_BUFFER_TYPE,
    data_view: any,
    byte_offset: any,
    byte_size: any,
    component_len: any,
    is_static = true,
    unbind = true
  ) {
    let buf = new Buffer(this.gl.ctx.createBuffer()!, buf_type, is_static);
    buf.component_len = component_len;

    this.gl.ctx.bindBuffer(buf_type, buf.id);
    this.gl.ctx.bufferData(
      buf_type,
      data_view,
      buf.usage,
      byte_offset,
      byte_size
    );
    if (unbind) this.gl.ctx.bindBuffer(buf_type, null);

    buf.byte_len = buf.capacity = byte_size;
    return buf;
  }

  new_uniform(t_ary?: TypedArray, is_static = true, unbind = true) {
    return from_type_array(
      this.gl.ctx,
      GL_BUFFER_TYPE.UNIFORM_BUFFER,
      t_ary,
      is_static,
      unbind
    );
  }
  new_element(t_ary: TypedArray, is_static = true, unbind = true) {
    return from_type_array(
      this.gl.ctx,
      GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER,
      t_ary,
      is_static,
      unbind
    );
  }
  new_array(t_ary?: TypedArray, comp_len = 3, is_static = true, unbind = true) {
    let buf = from_type_array(
      this.gl.ctx,
      GL_BUFFER_TYPE.ARRAY_BUFFER,
      t_ary,
      is_static,
      unbind
    );
    buf.component_len = comp_len;
    return buf;
  }

  bin_element(
    data_view: any,
    byte_offset: any,
    byte_size: any,
    component_len: any,
    is_static = true,
    unbind = true
  ) {
    return this.from_bin(
      GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER,
      data_view,
      byte_offset,
      byte_size,
      component_len,
      is_static,
      unbind
    );
  }

  bin_array(
    data_view: any,
    byte_offset: any,
    byte_size: any,
    component_len: any,
    is_static = true,
    unbind = true
  ) {
    return this.from_bin(
      GL_BUFFER_TYPE.ARRAY_BUFFER,
      data_view,
      byte_offset,
      byte_size,
      component_len,
      is_static,
      unbind
    );
  }

  new_empty_array(byte_size: any, is_static = true, unbind = true) {
    let buf = new Buffer(
      this.gl.ctx.createBuffer()!,
      GL_BUFFER_TYPE.ARRAY_BUFFER,
      is_static
    );

    this.gl.ctx.bindBuffer(buf.type, buf.id);
    this.gl.ctx.bufferData(buf.type, byte_size, buf.usage);

    buf.capacity = byte_size;
    if (unbind) this.gl.ctx.bindBuffer(buf.type, null);
    return buf;
  }
  // #endregion //////////////////////////////////////////////////////////////////////////////////////

  // #region UPDATE
  update_data(buf: any, type_ary: any) {
    let b_len = type_ary.byteLength;
    this.gl.ctx.bindBuffer(buf.type, buf.id);

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
      this.gl.ctx.bufferSubData(buf.type, 0, type_ary, 0, undefined);
    else {
      buf.capacity = b_len;
      // if( this.byte_len > 0) gl.ctx.bufferData( this.type, null, gl.ctx.DYNAMIC_DRAW ); // Clean up previus data
      this.gl.ctx.bufferData(buf.type, type_ary, buf.usage);
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    this.gl.ctx.bindBuffer(buf.type, null); // unbind buffer
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
    this.gl.ctx.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, null);
    return this;
  }
  unbind_element() {
    this.gl.ctx.bindBuffer(GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER, null);
    return this;
  }
  unbind_uniform() {
    this.gl.ctx.bindBuffer(GL_BUFFER_TYPE.UNIFORM_BUFFER, null);
    return this;
  }
  // #endregion //////////////////////////////////////////////////////////////////////////////////////
}
