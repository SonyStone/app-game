import { GL_BUFFER_TYPE } from '@webgl/static-variables/buffer';
import { GL_STATIC_VARIABLES } from '@webgl/static-variables/static-variables';

import { Context } from './Context';

class Buffer {
  // #region MAIN
  id: any = null; // Buffer GL ID
  type: any = null; // Buffer Type
  data_type: number = GL_STATIC_VARIABLES.FLOAT; // Data Type Used
  usage = 0; // Is it static or dynamic
  capacity = 0; // Capacity in bytes of the gpu buffer
  byte_len = 0; // How Many Bytes Currently Posted to the GPU
  component_len = 0; // How many Elements make one component, Like Vec3 has 3.

  //interleaved     = null;
  stride_len = 0; // Length of Data chunks, interleaved data.
  offset = 0; // Offset of Of Data Chunk, Data Leaved

  constructor(id: any, type: any, is_static = true) {
    this.id = id;
    this.type = type;
    this.usage = is_static
      ? GL_STATIC_VARIABLES.STATIC_DRAW
      : GL_STATIC_VARIABLES.DYNAMIC_DRAW;
  }
  // #endregion //////////////////////////////////////////////////////////////////////////////////////
}

export class BufferFactory {
  constructor(readonly gl: Context) {}

  // #region CREATE
  from_type_array(
    buf_type: any,
    t_ary: any = null,
    is_static = true,
    unbind = true
  ) {
    let buf = new Buffer(this.gl.ctx.createBuffer(), buf_type, is_static);

    if (t_ary) {
      this.gl.ctx.bindBuffer(buf.type, buf.id);
      this.gl.ctx.bufferData(buf.type, t_ary, buf.usage);
      if (unbind) this.gl.ctx.bindBuffer(buf.type, null);

      buf.byte_len = buf.capacity = t_ary.byteLength;
      if (t_ary instanceof Uint16Array)
        buf.data_type = GL_STATIC_VARIABLES.UNSIGNED_SHORT;
      else if (t_ary instanceof Uint32Array)
        buf.data_type = GL_STATIC_VARIABLES.UNSIGNED_INT;
    }

    return buf;
  }

  from_bin(
    buf_type: any,
    data_view: any,
    byte_offset: any,
    byte_size: any,
    component_len: any,
    is_static = true,
    unbind = true
  ) {
    let buf = new Buffer(this.gl.ctx.createBuffer(), buf_type, is_static);
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

  new_uniform(t_ary: any = null, is_static = true, unbind = true) {
    return this.from_type_array(
      GL_STATIC_VARIABLES.UNIFORM_BUFFER,
      t_ary,
      is_static,
      unbind
    );
  }
  new_element(t_ary: any = null, is_static = true, unbind = true) {
    return this.from_type_array(
      GL_STATIC_VARIABLES.ELEMENT_ARRAY_BUFFER,
      t_ary,
      is_static,
      unbind
    );
  }
  new_array(t_ary: any = null, comp_len = 3, is_static = true, unbind = true) {
    let buf = this.from_type_array(
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
      GL_STATIC_VARIABLES.ELEMENT_ARRAY_BUFFER,
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
      this.gl.ctx.createBuffer(),
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
    this.gl.ctx.bindBuffer(GL_STATIC_VARIABLES.ARRAY_BUFFER, null);
    return this;
  }
  unbind_element() {
    this.gl.ctx.bindBuffer(GL_STATIC_VARIABLES.ELEMENT_ARRAY_BUFFER, null);
    return this;
  }
  unbind_uniform() {
    this.gl.ctx.bindBuffer(GL_STATIC_VARIABLES.UNIFORM_BUFFER, null);
    return this;
  }
  // #endregion //////////////////////////////////////////////////////////////////////////////////////
}
