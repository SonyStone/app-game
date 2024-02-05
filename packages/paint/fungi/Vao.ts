import { GL_BUFFER_TYPE, GL_DATA_TYPE } from '@webgl/static-variables';
import { IBuffer } from './Buffer';

/**
 * Creates Vector Array Object
 * VAO is about binding data to attributes.
 *
 * ```
 * VAO
 *  0 → Vector Buffer Object
 *  1 → Vector Buffer Object
 *  2 → Vector Buffer Object
 * ```
 **/
export function createVAO(
  gl: WebGL2RenderingContext,
  config: {
    buffer: IBuffer;
    interleaved?: {
      attrib_loc: number;
      size: number;
      stride_len: number;
      offset: number;
    }[];
    attrib_loc?: any;
    instanced?: boolean;
  }[]
) {
  // Create Vao
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  // Bind Buffer to VAO
  for (const itm of config) {
    const buf = itm.buffer;
    gl.bindBuffer(buf.type, buf.id);

    if (!itm.interleaved) {
      // Only Array Buffers have Attribute Loc.
      if (itm.attrib_loc !== undefined && itm.attrib_loc !== null) {
        gl.enableVertexAttribArray(itm.attrib_loc);
        gl.vertexAttribPointer(
          itm.attrib_loc,
          buf.component_len,
          GL_DATA_TYPE.FLOAT,
          false,
          buf.stride_len,
          buf.offset
        );
        if (itm.instanced) {
          gl.vertexAttribDivisor(itm.attrib_loc, 1);
        }
      }
    } else {
      for (const spec of itm.interleaved) {
        gl.enableVertexAttribArray(spec.attrib_loc);
        gl.vertexAttribPointer(spec.attrib_loc, spec.size, GL_DATA_TYPE.FLOAT, false, spec.stride_len, spec.offset);
        if (itm.instanced) {
          gl.vertexAttribDivisor(spec.attrib_loc, 1);
        }
      }
    }
  }

  // cleanup
  unbind_all(gl);

  return vao;
}

function bind_vao(ctx: WebGL2RenderingContext, vao: WebGLVertexArrayObject) {
  ctx.bindVertexArray(vao);
}

function unbind(ctx: WebGL2RenderingContext) {
  ctx.bindVertexArray(null);
}

function unbind_all(ctx: Pick<WebGL2RenderingContext, 'bindVertexArray' | 'bindBuffer'>) {
  // Close VAO in the proper order, VAO first then Buffers
  ctx.bindVertexArray(null);
  ctx.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, null); // Array Buffer
  ctx.bindBuffer(GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER, null); // Element Array Buffer
}
