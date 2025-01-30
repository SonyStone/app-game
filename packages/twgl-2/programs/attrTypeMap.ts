import { GL_DATA_TYPE } from '@packages/webgl/static-variables';
import { BUFFER_TARGET } from '@packages/webgl/static-variables/buffer';
import { typeMap, TypeMapKeys } from './typeMap';

// prettier-ignore
export const attrTypeMap = {
  [GL_DATA_TYPE.FLOAT]:             { size:  4, setter: floatAttribSetter, },
  [GL_DATA_TYPE.FLOAT_VEC2]:        { size:  8, setter: floatAttribSetter, },
  [GL_DATA_TYPE.FLOAT_VEC3]:        { size: 12, setter: floatAttribSetter, },
  [GL_DATA_TYPE.FLOAT_VEC4]:        { size: 16, setter: floatAttribSetter, },
  [GL_DATA_TYPE.INT]:               { size:  4, setter: intAttribSetter,   },
  [GL_DATA_TYPE.INT_VEC2]:          { size:  8, setter: intAttribSetter,   },
  [GL_DATA_TYPE.INT_VEC3]:          { size: 12, setter: intAttribSetter,   },
  [GL_DATA_TYPE.INT_VEC4]:          { size: 16, setter: intAttribSetter,   },
  [GL_DATA_TYPE.UNSIGNED_INT]:      { size:  4, setter: uintAttribSetter,  },
  [GL_DATA_TYPE.UNSIGNED_INT_VEC2]: { size:  8, setter: uintAttribSetter,  },
  [GL_DATA_TYPE.UNSIGNED_INT_VEC3]: { size: 12, setter: uintAttribSetter,  },
  [GL_DATA_TYPE.UNSIGNED_INT_VEC4]: { size: 16, setter: uintAttribSetter,  },
  [GL_DATA_TYPE.BOOL]:              { size:  4, setter: intAttribSetter,   },
  [GL_DATA_TYPE.BOOL_VEC2]:         { size:  8, setter: intAttribSetter,   },
  [GL_DATA_TYPE.BOOL_VEC3]:         { size: 12, setter: intAttribSetter,   },
  [GL_DATA_TYPE.BOOL_VEC4]:         { size: 16, setter: intAttribSetter,   },
  [GL_DATA_TYPE.FLOAT_MAT2]:        { size:  4, setter: matAttribSetter, count: 2, },
  [GL_DATA_TYPE.FLOAT_MAT3]:        { size:  9, setter: matAttribSetter, count: 3, },
  [GL_DATA_TYPE.FLOAT_MAT4]:        { size: 16, setter: matAttribSetter, count: 4, },
} as const;

export type AttrTypeMap = typeof attrTypeMap;
export type AttrTypeMapKeys = keyof AttrTypeMap;
export type AttrTypeInfo = AttrTypeMap[AttrTypeMapKeys];

export type AttribSetter = ReturnType<AttrTypeInfo['setter']>;

/**
 * The info for an attribute. This is effectively just the arguments to `gl.vertexAttribPointer` plus the WebGLBuffer
 * for the attribute.
 */
export type AttribInfo = {
  /**
   * a constant value for the attribute. Note: if this is set the attribute will be
   * disabled and set to this constant value and all other values will be ignored.
   * */
  // ! ArrayBufferView is not supported?
  value?: number[] | Float32Array | Int32Array | Uint32Array;
  /** the number of components for this attribute. */
  numComponents?: number;
  /** synonym for `numComponents`. */
  size?: number;
  /** the type of the attribute (eg. `gl.FLOAT`, `gl.UNSIGNED_BYTE`, etc...) Default = `gl.FLOAT` */
  type?: number;
  /** whether or not to normalize the data. Default = false */
  normalize?: boolean;
  /** offset into buffer in bytes. Default = 0 */
  offset?: number;
  /** the stride in bytes per element. Default = 0 */
  stride?: number;
  /** the divisor in instances. Default = 0. */
  divisor?: number;
  /** the buffer that contains the data for this attribute */
  buffer: WebGLBuffer;
  /** the draw type passed to gl.bufferData. Default = gl.STATIC_DRAW */
  drawType?: number;
};

function floatAttribSetter(gl: WebGL2RenderingContext, index: number) {
  return function (b: AttribInfo) {
    if (b.value) {
      gl.disableVertexAttribArray(index);
      switch (b.value.length) {
        case 4:
          gl.vertexAttrib4fv(index, b.value);
          break;
        case 3:
          gl.vertexAttrib3fv(index, b.value);
          break;
        case 2:
          gl.vertexAttrib2fv(index, b.value);
          break;
        case 1:
          gl.vertexAttrib1fv(index, b.value);
          break;
        default:
          throw new Error('the length of a float constant value must be between 1 and 4!');
      }
    } else {
      gl.bindBuffer(BUFFER_TARGET.ARRAY_BUFFER, b.buffer);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(
        index,
        b.numComponents || b.size || 0,
        b.type || GL_DATA_TYPE.FLOAT,
        b.normalize || false,
        b.stride || 0,
        b.offset || 0
      );
      if (gl.vertexAttribDivisor) {
        gl.vertexAttribDivisor(index, b.divisor || 0);
      }
    }
  };
}

function intAttribSetter(gl: WebGL2RenderingContext, index: number) {
  return function (b: AttribInfo) {
    if (b.value) {
      gl.disableVertexAttribArray(index);
      if (b.value.length === 4) {
        gl.vertexAttribI4iv(index, b.value);
      } else {
        throw new Error('The length of an integer constant value must be 4!');
      }
    } else {
      gl.bindBuffer(BUFFER_TARGET.ARRAY_BUFFER, b.buffer);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribIPointer(
        index,
        b.numComponents || b.size || 0,
        b.type || GL_DATA_TYPE.INT,
        b.stride || 0,
        b.offset || 0
      );
      if (gl.vertexAttribDivisor) {
        gl.vertexAttribDivisor(index, b.divisor || 0);
      }
    }
  };
}

function uintAttribSetter(gl: WebGL2RenderingContext, index: number) {
  return function (b: AttribInfo) {
    if (b.value) {
      gl.disableVertexAttribArray(index);
      if (b.value.length === 4) {
        gl.vertexAttribI4uiv(index, b.value);
      } else {
        throw new Error('The length of an unsigned integer constant value must be 4!');
      }
    } else {
      gl.bindBuffer(BUFFER_TARGET.ARRAY_BUFFER, b.buffer);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribIPointer(
        index,
        b.numComponents || b.size || 0,
        b.type || GL_DATA_TYPE.UNSIGNED_INT,
        b.stride || 0,
        b.offset || 0
      );
      if (gl.vertexAttribDivisor) {
        gl.vertexAttribDivisor(index, b.divisor || 0);
      }
    }
  };
}

function matAttribSetter(gl: WebGL2RenderingContext, index: number, typeInfo: { size: number; count: number }) {
  const defaultSize = typeInfo.size;
  const count = typeInfo.count;

  return function (b: AttribInfo) {
    gl.bindBuffer(BUFFER_TARGET.ARRAY_BUFFER, b.buffer);
    const numComponents = b.size || b.numComponents || defaultSize;
    const size = numComponents / count;
    const type = b.type || GL_DATA_TYPE.FLOAT;
    const typeInfo = typeMap[type as TypeMapKeys];
    const stride = typeInfo.size * numComponents;
    const normalize = b.normalize || false;
    const offset = b.offset || 0;
    const rowOffset = stride / count;
    for (let i = 0; i < count; ++i) {
      gl.enableVertexAttribArray(index + i);
      gl.vertexAttribPointer(index + i, size, type, normalize, stride, offset + rowOffset * i);
      if (gl.vertexAttribDivisor) {
        gl.vertexAttribDivisor(index + i, b.divisor || 0);
      }
    }
  };
}
