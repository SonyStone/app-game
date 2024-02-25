import { GL_BUFFER_TYPE, GL_BUFFER_USAGE, GL_DRAW_ELEMENTS_TYPE } from '@packages/webgl/static-variables';
import { TYPES } from 'pixi.js';

type TypedArray =
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | BigUint64Array
  | BigInt64Array
  | Float32Array
  | Float64Array;

interface Attribute {
  buffer: number;
  size: number;
  normalized: boolean;
  type: TYPES;
  stride: number;
  start: number;
  instance: boolean;
}

interface Buffer {
  data: TypedArray;
  type: GL_BUFFER_TYPE;
  usage: GL_BUFFER_USAGE;
}

export interface Geometry {
  buffers: Buffer[];
  attributes: { [key: string]: Attribute };
  instanced: boolean;
  indexBuffer:
    | {
        byteSize: number;
        length: number;
        type: GL_DRAW_ELEMENTS_TYPE;
      }
    | undefined;
  getSize(): number;
}

export function getGeometry() {
  const buffers: Buffer[] = [];
  const attributes: { [key: string]: Attribute } = {};
  let instanced = false;
  let indexBuffer: Geometry['indexBuffer'] = undefined;

  function getBufferIndex(buffer: Buffer): number {
    let bufferIndex = buffers.indexOf(buffer);
    if (bufferIndex === -1) {
      buffers.push(buffer);
      bufferIndex = buffers.length - 1;
    }

    return bufferIndex;
  }

  const builder = {
    addAttribute(
      name: string,
      buffer: Buffer,
      size = 0,
      normalized = false,
      type = TYPES.FLOAT,
      stride = 0,
      start = 0,
      instance = false
    ) {
      const bufferIndex = getBufferIndex(buffer);

      attributes[name] = {
        buffer: bufferIndex,
        size,
        normalized,
        type,
        stride,
        start,
        instance
      };

      instanced = instance;

      return builder;
    },
    addIndex(data: TypedArray) {
      const buffer = {
        data,
        type: GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER,
        usage: GL_BUFFER_USAGE.STATIC_DRAW
      };

      const byteSize = data.BYTES_PER_ELEMENT;
      const type = byteSize === 2 ? GL_DRAW_ELEMENTS_TYPE.UNSIGNED_SHORT : GL_DRAW_ELEMENTS_TYPE.UNSIGNED_INT;
      const length = data.length;

      indexBuffer = {
        type,
        length,
        byteSize
      };

      getBufferIndex(buffer);

      return builder;
    },
    build(): Geometry {
      return {
        buffers,
        attributes,
        instanced,
        indexBuffer,
        getSize(): number {
          for (const i in attributes) {
            const attribute = attributes[i];
            const buffer = buffers[attribute.buffer];

            return buffer.data.length / (attribute.stride / 4 || attribute.size);
          }

          return 0;
        }
      };
    }
  };

  return builder;
}
