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

  /** Parse descriptor entries, retaining nested class names and wire types. */
  parseDescriptor(): Record<string, DescriptorValue> {
    return this.parseDescriptorObject().value;
  }

  /** Read one typed value. Unknown types abort because their length is unknown. */
  parseValue(): DescriptorValue {
    if (++this.depth > 128) throw new Error('Descriptor nesting exceeds 128 levels');
    try {
      return this.readValue();
    } finally {
      this.depth--;
    }
  }

  private depth = 0;

  private readValue(): DescriptorValue {
    const offset = this.reader.position;
    const type = this.reader.readString(4);
    switch (type) {
      case 'long':
        return { type, value: this.reader.readInt32BE() };
      case 'doub':
        return { type, value: this.reader.readDoubleBE() };
      case 'bool':
        return { type, value: this.reader.readUInt8() !== 0 };
      case 'TEXT':
        return { type, value: this.reader.readUnicodeString() };
      case 'enum':
        return { type, typeId: this.reader.readId(), value: this.reader.readId() };
      case 'UntF':
        return { type, unit: this.reader.readString(4), value: this.reader.readDoubleBE() };
      case 'Objc':
      case 'GlbO':
        return { type, ...this.parseDescriptorObject() };
      case 'type':
      case 'GlbC':
        return { type, className: this.reader.readUnicodeString(), classId: this.reader.readId() };
      case 'comp':
        return { type, value: new Uint8Array(this.reader.readBytes(8)) };
      case 'VlLs': {
        const count = this.reader.readUInt32BE();
        if (count > this.reader.remaining / 4) throw new Error('List count exceeds remaining data');
        const value: DescriptorValue[] = [];
        for (let i = 0; i < count; i++) value.push(this.parseValue());
        return { type, value };
      }
      case 'alis':
      case 'tdta':
        return { type, value: new Uint8Array(this.reader.readBytes(this.reader.readUInt32BE())) };
      case 'obj ': {
        const start = this.reader.position;
        this.readReference();
        const end = this.reader.position;
        this.reader.seek(start);
        return { type, value: new Uint8Array(this.reader.readBytes(end - start)) };
      }
      default:
        throw new Error(`Unsupported descriptor type "${type}" at offset ${offset}`);
    }
  }

  /** Read a descriptor envelope as well as its entries for faithful reconstruction. */
  parseDescriptorObject(): { className: string; classId: string; value: Record<string, DescriptorValue> } {
    const className = this.reader.readUnicodeString();
    const classId = this.reader.readId();
    const count = this.reader.readUInt32BE();
    if (count > this.reader.remaining / 8) throw new Error('Descriptor count exceeds remaining data');
    const value: Record<string, DescriptorValue> = Object.create(null);
    for (let i = 0; i < count; i++) {
      const key = this.reader.readId();
      if (Object.hasOwn(value, key)) throw new Error(`Duplicate descriptor key "${key}"`);
      value[key] = this.parseValue();
    }
    return { className, classId, value };
  }

  /** Consume documented reference structures; retain their exact encoded payload. */
  private readReference(): void {
    const count = this.reader.readUInt32BE();
    if (count > this.reader.remaining / 4) throw new Error('Reference count exceeds remaining data');
    for (let i = 0; i < count; i++) {
      const type = this.reader.readString(4);
      if (type === 'Idnt' || type === 'indx') {
        this.reader.readUInt32BE();
        continue;
      }
      if (!['prop', 'Clss', 'Enmr', 'rele', 'name'].includes(type)) {
        throw new Error(`Unsupported reference type "${type}"`);
      }
      this.reader.readUnicodeString();
      this.reader.readId();
      switch (type) {
        case 'prop':
          this.reader.readId();
          break;
        case 'Enmr':
          this.reader.readId();
          this.reader.readId();
          break;
        case 'rele':
          this.reader.readInt32BE();
          break;
        case 'name':
          this.reader.readUnicodeString();
          break;
      }
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

export function getObject(
  desc: Record<string, DescriptorValue>,
  key: string
): Record<string, DescriptorValue> | undefined {
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
