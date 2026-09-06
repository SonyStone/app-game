/**
 * Photoshop Descriptor Serializer
 * Serializes brush settings to Photoshop's binary descriptor format
 */

import { BinaryWriter } from './binary-writer';
import { DescriptorValue } from './types';

export class DescriptorSerializer {
  private writer: BinaryWriter;

  constructor(writer: BinaryWriter) {
    this.writer = writer;
  }

  /**
   * Serialize a descriptor to binary format
   */
  serializeDescriptor(desc: Record<string, DescriptorValue>, className: string = '', classId: string = 'null'): void {
    // Write Unicode class name string (length + UTF-16 chars)
    // For empty class names, Photoshop uses length=1 with a null char
    this.writer.writeClassName(className);

    // Write class ID (length-prefixed or 4-byte key)
    this.writer.writeId(classId);

    // Write item count
    const keys = Object.keys(desc);
    this.writer.writeUInt32BE(keys.length);

    // Write each key/value pair
    for (const key of keys) {
      this.writer.writeId(key);
      this.serializeValue(desc[key]);
    }
  }

  /**
   * Serialize a single value
   */
  serializeValue(value: DescriptorValue): void {
    this.writer.writeString(value.type, 4);

    switch (value.type) {
      case 'long':
        this.writer.writeInt32BE(value.value);
        break;

      case 'doub':
        this.writer.writeDoubleBE(value.value);
        break;

      case 'bool':
        this.writer.writeUInt8(value.value ? 1 : 0);
        break;

      case 'TEXT':
        this.writer.writeTextValue(value.value);
        break;

      case 'enum':
        this.writer.writeId(value.typeId);
        this.writer.writeId(value.value);
        break;

      case 'UntF':
        this.writer.writeString(value.unit, 4);
        this.writer.writeDoubleBE(value.value);
        break;

      case 'Objc':
        // Nested object - write class name and class ID, then items
        // For empty class names, Photoshop uses length=1 with a null char
        const className = value.className || '';
        this.writer.writeClassName(className);
        this.writer.writeId(value.classId);
        
        const items = value.value;
        const objKeys = Object.keys(items);
        this.writer.writeUInt32BE(objKeys.length);
        
        for (const key of objKeys) {
          this.writer.writeId(key);
          this.serializeValue(items[key]);
        }
        break;

      case 'VlLs':
        this.writer.writeUInt32BE(value.value.length);
        for (const item of value.value) {
          this.serializeValue(item);
        }
        break;

      case 'tdta':
        const data = value.value;
        this.writer.writeUInt32BE(data.length);
        this.writer.writeBytes(data);
        break;

      case 'obj ':
        // Object reference - write empty reference for now
        this.writer.writeUInt32BE(0);
        break;

      default:
        // Unknown type - should not happen
        console.warn(`Unknown descriptor type: ${(value as any).type}`);
        break;
    }
  }
}

/**
 * Helper to create descriptor values
 */
export const makeDescriptor = {
  long: (value: number): DescriptorValue => ({ type: 'long', value }),
  doub: (value: number): DescriptorValue => ({ type: 'doub', value }),
  bool: (value: boolean): DescriptorValue => ({ type: 'bool', value }),
  text: (value: string): DescriptorValue => ({ type: 'TEXT', value }),
  enum: (typeId: string, value: string): DescriptorValue => ({ type: 'enum', typeId, value }),
  unit: (unit: string, value: number): DescriptorValue => ({ type: 'UntF', unit, value }),
  obj: (classId: string, value: Record<string, DescriptorValue>, className?: string): DescriptorValue => ({ type: 'Objc', classId, value, className }),
  list: (value: DescriptorValue[]): DescriptorValue => ({ type: 'VlLs', value }),
  data: (value: Uint8Array): DescriptorValue => ({ type: 'tdta', value }),
};
