/**
 * Photoshop Descriptor Parser
 * Parses the binary descriptor format used in ABR files for brush settings
 */

import { BinaryReader } from './binary-reader';
import { DescriptorValue } from './types';

export class DescriptorParser {
  private reader: BinaryReader;

  constructor(reader: BinaryReader) {
    this.reader = reader;
  }

  /**
   * Parse a descriptor from the current position
   */
  parseDescriptor(): Record<string, DescriptorValue> {
    // Read Unicode class name string first (length + UTF-16 chars)
    const nameLength = this.reader.readUInt32BE();
    if (nameLength > 0) {
      // Skip the Unicode name
      this.reader.skip(nameLength * 2);
    }

    // Read class ID (length-prefixed or 4-byte key)
    const classIdLength = this.reader.readUInt32BE();
    let classId: string;
    if (classIdLength === 0) {
      classId = this.reader.readString(4);
    } else {
      classId = this.reader.readString(classIdLength);
    }

    const itemCount = this.reader.readUInt32BE();
    const result: Record<string, DescriptorValue> = {};

    for (let i = 0; i < itemCount; i++) {
      const key = this.reader.readId();
      const value = this.parseValue();
      if (value) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Parse a single value
   */
  parseValue(): DescriptorValue | null {
    const type = this.reader.readString(4);

    switch (type) {
      case 'long':
        return { type: 'long', value: this.reader.readInt32BE() };

      case 'doub':
        return { type: 'doub', value: this.reader.readDoubleBE() };

      case 'bool':
        return { type: 'bool', value: this.reader.readUInt8() !== 0 };

      case 'TEXT':
        return { type: 'TEXT', value: this.reader.readUnicodeString() };

      case 'enum': {
        const typeId = this.reader.readId();
        const value = this.reader.readId();
        return { type: 'enum', typeId, value };
      }

      case 'UntF': {
        const unit = this.reader.readString(4);
        const value = this.reader.readDoubleBE();
        return { type: 'UntF', unit, value };
      }

      case 'Objc': {
        // Read Unicode class name string first
        const nameLength = this.reader.readUInt32BE();
        if (nameLength > 0) {
          this.reader.skip(nameLength * 2);
        }
        
        const classIdLength = this.reader.readUInt32BE();
        let classId: string;
        if (classIdLength === 0) {
          classId = this.reader.readString(4);
        } else {
          classId = this.reader.readString(classIdLength);
        }
        const itemCount = this.reader.readUInt32BE();
        const items: Record<string, DescriptorValue> = {};

        for (let i = 0; i < itemCount; i++) {
          const key = this.reader.readId();
          const value = this.parseValue();
          if (value) {
            items[key] = value;
          }
        }

        return { type: 'Objc', classId, value: items };
      }

      case 'VlLs': {
        const count = this.reader.readUInt32BE();
        const values: DescriptorValue[] = [];
        for (let i = 0; i < count; i++) {
          const value = this.parseValue();
          if (value) {
            values.push(value);
          }
        }
        return { type: 'VlLs', value: values };
      }

      case 'tdta': {
        const length = this.reader.readUInt32BE();
        const data = this.reader.readBytes(length);
        return { type: 'tdta', value: Buffer.from(data) };
      }

      case 'obj ': {
        // Object reference - complex type, skip for now
        const refCount = this.reader.readUInt32BE();
        for (let i = 0; i < refCount; i++) {
          const refType = this.reader.readString(4);
          switch (refType) {
            case 'Clss': {
              this.reader.readId(); // name
              this.reader.readId(); // classId
              break;
            }
            case 'Enmr': {
              this.reader.readId(); // name
              this.reader.readId(); // classId
              this.reader.readId(); // typeId
              this.reader.readId(); // enum
              break;
            }
            case 'Idnt': {
              this.reader.readUInt32BE();
              break;
            }
            case 'indx': {
              this.reader.readUInt32BE();
              break;
            }
            case 'name': {
              this.reader.readId(); // name
              this.reader.readId(); // classId
              this.reader.readUnicodeString();
              break;
            }
            case 'prop': {
              this.reader.readId(); // name
              this.reader.readId(); // classId
              this.reader.readId(); // keyId
              break;
            }
            case 'rele': {
              this.reader.readId(); // name
              this.reader.readId(); // classId
              this.reader.readUInt32BE();
              break;
            }
            default:
              // Unknown reference type
              break;
          }
        }
        return { type: 'obj ', value: null };
      }

      default:
        // Unknown type - try to continue
        console.warn(`Unknown descriptor type: ${type}`);
        return null;
    }
  }
}

/**
 * Helper functions to extract values from parsed descriptors
 */
export function getNumber(desc: Record<string, DescriptorValue>, key: string): number | undefined {
  const value = desc[key];
  if (!value) return undefined;
  
  if (value.type === 'long' || value.type === 'doub') {
    return value.value;
  }
  if (value.type === 'UntF') {
    return value.value;
  }
  return undefined;
}

export function getString(desc: Record<string, DescriptorValue>, key: string): string | undefined {
  const value = desc[key];
  if (!value) return undefined;
  
  if (value.type === 'TEXT') {
    return value.value;
  }
  if (value.type === 'enum') {
    return value.value;
  }
  return undefined;
}

export function getBoolean(desc: Record<string, DescriptorValue>, key: string): boolean | undefined {
  const value = desc[key];
  if (!value) return undefined;
  
  if (value.type === 'bool') {
    return value.value;
  }
  return undefined;
}

export function getObject(desc: Record<string, DescriptorValue>, key: string): Record<string, DescriptorValue> | undefined {
  const value = desc[key];
  if (!value) return undefined;
  
  if (value.type === 'Objc') {
    return value.value;
  }
  return undefined;
}

export function getList(desc: Record<string, DescriptorValue>, key: string): DescriptorValue[] | undefined {
  const value = desc[key];
  if (!value) return undefined;
  
  if (value.type === 'VlLs') {
    return value.value;
  }
  return undefined;
}
