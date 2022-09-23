import { GL_STATIC_VARIABLES } from '@webgl/static-variables/static-variables';
import { BufferFactory } from './Buffer';
import { Context } from './Context';
import { ShaderFactory } from './Shader';
import { Vao, VaoFactory } from './Vao';

export class Mesh {
  vao?: Vao = undefined;
  element_cnt = 0;
  element_type = 0;
  instance_cnt = 0;
  instanced = false;
  buffers = new Map();

  constructor(readonly name: string) {}
}

export class MeshFactory {
  PNT = 0;
  LINE = 1;
  LINE_LOOP = 2;
  LINE_STRIP = 3;
  TRI = 4;
  TRI_STRIP = 5;

  constructor(
    readonly gl: Context,
    readonly vao: VaoFactory,
    readonly buffer: BufferFactory,
    readonly shader: ShaderFactory
  ) {}

  new(name: string) {
    return new Mesh(name);
  }

  draw(m: any, draw_mode = 0, do_bind = true) {
    if (do_bind) this.gl.ctx.bindVertexArray(m.vao.id);

    if (m.element_cnt != 0) {
      if (m.element_type !== 0)
        this.gl.ctx.drawElements(draw_mode, m.element_cnt, m.element_type, 0);
      else this.gl.ctx.drawArrays(draw_mode, 0, m.element_cnt);
    }

    if (do_bind) this.gl.ctx.bindVertexArray(null);
    return this;
  }

  from_data(
    name: any,
    vert: any,
    vert_comp_len = 3,
    idx: any = null,
    norm: any = null,
    uv: any = null,
    color: any = null,
    is_rgba: any = false,
    b_idx: any = null,
    b_wgt: any = null,
    bone_limit = 4
  ) {
    let mesh = new Mesh(name),
      buf = this.buffer.new_array(vert, vert_comp_len, true, true),
      config: any[] = [{ buffer: buf, attrib_loc: this.shader.POS_LOC }];

    mesh.buffers.set('vertices', buf);

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    if (idx) {
      buf = this.buffer.new_element(idx, true, true);
      mesh.buffers.set('indices', buf);
      config.push({ buffer: buf });

      if (idx instanceof Uint16Array)
        mesh.element_type = GL_STATIC_VARIABLES.UNSIGNED_SHORT;
      else if (idx instanceof Uint32Array)
        mesh.element_type = GL_STATIC_VARIABLES.UNSIGNED_INT;
    }

    if (norm) {
      buf = this.buffer.new_array(norm, 3, true, true);
      mesh.buffers.set('normal', buf);
      config.push({ buffer: buf, attrib_loc: this.shader.NORM_LOC });
    }

    if (uv) {
      buf = this.buffer.new_array(uv, 2, true, true);
      mesh.buffers.set('uv', buf);
      config.push({ buffer: buf, attrib_loc: this.shader.UV_LOC });
    }

    if (color) {
      buf = this.buffer.new_array(color, is_rgba ? 4 : 3, true, true);
      mesh.buffers.set('color', buf);
      config.push({ buffer: buf, attrib_loc: this.shader.COLOR_LOC });
    }

    if (b_idx && b_wgt) {
      buf = this.buffer.new_array(b_idx, bone_limit, true, true);
      mesh.buffers.set('skin_idx', buf);
      config.push({ buffer: buf, attrib_loc: this.shader.SKIN_IDX_LOC });

      buf = this.buffer.new_array(b_wgt, bone_limit, true, true);
      mesh.buffers.set('skin_wgt', buf);
      config.push({ buffer: buf, attrib_loc: this.shader.SKIN_WGT_LOC });
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    mesh.vao = this.vao.new(config);
    mesh.element_cnt = idx ? idx.length : vert.length / vert_comp_len;
    return mesh;
  }

  from_buffer_config(
    config: any,
    name: any,
    element_cnt = 0,
    instance_cnt = 0
  ) {
    let i,
      m = new Mesh(name);

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Basic Configuration
    for (i of config) {
      m.buffers.set(i.name, i.buffer); // Save Buffer to Mesh
      if (i.instanced) m.instanced = true; // Is there instanced Data being used?

      if (i.buffer.type == GL_STATIC_VARIABLES.ELEMENT_ARRAY_BUFFER)
        // What Data Type is the Element Buffer
        m.element_type = i.buffer.data_type;
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Final Configuration
    m.element_cnt = element_cnt;
    m.instance_cnt = instance_cnt;
    m.vao = this.vao.new(config);

    return m;
  }

  from_bin(name: any, json: any, bin: any, load_skin = false) {
    let mesh = new Mesh(name),
      dv = bin instanceof ArrayBuffer ? new DataView(bin) : bin,
      config = [],
      buf,
      o;

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Index Buffer
    if (json.indices) {
      o = json.indices;
      switch (
        o.data_type // Indices can be imported as different Int types.
      ) {
        case 'uint16':
          mesh.element_type = GL_STATIC_VARIABLES.UNSIGNED_SHORT;
          break;
        case 'uint32':
          mesh.element_type = GL_STATIC_VARIABLES.UNSIGNED_INT;
          break;
        default:
          console.error('Unknown Array Type when Adding Indices', o.data_type);
          return null;
      }

      buf = this.buffer.bin_element(
        dv,
        o.byte_offset,
        o.byte_size,
        o.component_len,
        true,
        false
      );
      buf.data_type = mesh.element_type;
      mesh.buffers.set('indices', buf);
      config.push({ buffer: buf });
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Array Buffers
    o = json.vertices;
    buf = this.buffer.bin_array(
      dv,
      o.byte_offset,
      o.byte_size,
      o.component_len,
      true,
      false
    );
    mesh.buffers.set('vertices', buf);
    config.push({ buffer: buf, attrib_loc: this.shader.POS_LOC });

    if (json.normal) {
      o = json.normal;
      buf = this.buffer.bin_array(
        dv,
        o.byte_offset,
        o.byte_size,
        o.component_len,
        true,
        false
      );
      mesh.buffers.set('normal', buf);
      config.push({ buffer: buf, attrib_loc: this.shader.NORM_LOC });
    }

    if (json.uv) {
      o = json.uv;
      buf = this.buffer.bin_array(
        dv,
        o.byte_offset,
        o.byte_size,
        o.component_len,
        true,
        false
      );
      mesh.buffers.set('uv', buf);
      config.push({ buffer: buf, attrib_loc: this.shader.UV_LOC });
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // BONE INDICES AND WEIGHTS
    if (load_skin && json.joints && json.weights) {
      // JOINT INDICES
      // Can make this work BUT need to parse joints out of BIN as a Uint array, then
      // convert it to a Float32Array. This is a work around since there doesn't
      // seem to be a way to use Uint as an ARRAY buffer.
      // elmCount * compLen = Total Uints ( not total bytes )
      o = json.joints;

      let jnt_int_ary: any;
      switch (json.joints.data_type) {
        case 'uint8':
          jnt_int_ary = new Uint8Array(
            bin,
            o.byte_offset,
            o.element_cnt * o.component_len
          );
          break;
        case 'uint16':
          jnt_int_ary = new Uint16Array(
            bin,
            o.byte_offset,
            o.element_cnt * o.component_len
          );
          break;
        default:
          console.error('Joint Index Buffer Data Type Unknown');
          break;
      }

      let data = new Float32Array(jnt_int_ary);
      buf = this.buffer.new_array(data, o.component_len, true, false);
      mesh.buffers.set('skin_idx', buf);
      config.push({ buffer: buf, attrib_loc: this.shader.SKIN_IDX_LOC });

      o = json.weights;
      buf = this.buffer.bin_array(
        dv,
        o.byte_offset,
        o.byte_size,
        o.component_len,
        true,
        false
      );
      mesh.buffers.set('skin_wgt', buf);
      config.push({ buffer: buf, attrib_loc: this.shader.SKIN_WGT_LOC });
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    mesh.vao = this.vao.new(config);
    mesh.element_cnt = json.indices
      ? json.indices.element_cnt
      : json.vertices.element_cnt;
    return mesh;
  }

  from_data_config(config: any, name: any, element_cnt: any, instance_cnt = 0) {
    let i,
      buf,
      mesh = new Mesh(name);

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Generate Buffers
    for (i of config) {
      if (i.is_index) {
        buf = this.buffer.new_element(i.data, i.is_static ?? true);

        if (i.data instanceof Uint16Array)
          mesh.element_type = GL_STATIC_VARIABLES.UNSIGNED_SHORT;
        else if (i.data instanceof Uint32Array)
          mesh.element_type = GL_STATIC_VARIABLES.UNSIGNED_INT;
      } else {
        buf = this.buffer.new_array(i.data, i.size, i.is_static ?? true);
      }

      if (i.instanced) mesh.instanced = true;

      mesh.buffers.set(i.name, buf); // Save Buffer to Mesh
      i.buffer = buf; // Save Buffer to Config for VAO Generator
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Final Configurations
    mesh.vao = this.vao.new(config);
    mesh.element_cnt = element_cnt;
    mesh.instance_cnt = instance_cnt;

    return mesh;
  }
}
