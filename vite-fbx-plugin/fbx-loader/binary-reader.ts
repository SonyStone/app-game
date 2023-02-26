export class BinaryReader {
  offset = 0;
  _textDecoder = new TextDecoder();

  constructor(
    private readonly buffer: Buffer,
    private readonly littleEndian = true
  ) {}

  getOffset(): number {
    return this.offset;
  }

  size(): number {
    return this.buffer.byteLength;
  }

  skip(length: number): void {
    this.offset += length;
  }

  // seems like true/false representation depends on exporter.
  // true: 1 or 'Y'(=0x59), false: 0 or 'T'(=0x54)
  // then sees LSB.
  getBoolean(): boolean {
    return (this.getUint8() & 1) === 1;
  }

  getBooleanArray(size: number): boolean[] {
    const a = [];

    for (let i = 0; i < size; i++) {
      a.push(this.getBoolean());
    }

    return a;
  }

  getUint8(): number {
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  getInt16(): number | bigint {
    const value = this.buffer.readInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  getInt32(): number {
    const value = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  getInt32Array(size: number): number[] {
    const a = [];

    for (let i = 0; i < size; i++) {
      a.push(this.getInt32());
    }

    return a;
  }

  getUint32() {
    const value = this.buffer.readUint32LE(this.offset);
    this.offset += 4;
    return value;
  }

  // JavaScript doesn't support 64-bit integer so calculate this here
  // 1 << 32 will return 1 so using multiply operation instead here.
  // There's a possibility that this method returns wrong value if the value
  // is out of the range between Number.MAX_SAFE_INTEGER and Number.MIN_SAFE_INTEGER.
  // TODO: safely handle 64-bit integer
  getInt64() {
    let low, high;

    if (this.littleEndian) {
      low = this.getUint32();
      high = this.getUint32();
    } else {
      high = this.getUint32();
      low = this.getUint32();
    }

    // calculate negative value
    if (high & 0x80000000) {
      high = ~high & 0xffffffff;
      low = ~low & 0xffffffff;

      if (low === 0xffffffff) high = (high + 1) & 0xffffffff;

      low = (low + 1) & 0xffffffff;

      return -(high * 0x100000000 + low);
    }

    return high * 0x100000000 + low;
  }

  getInt64Array(size: number) {
    const a = [];

    for (let i = 0; i < size; i++) {
      a.push(this.getInt64());
    }

    return a;
  }

  // Note: see getInt64() comment
  getUint64() {
    let low, high;

    if (this.littleEndian) {
      low = this.getUint32();
      high = this.getUint32();
    } else {
      high = this.getUint32();
      low = this.getUint32();
    }

    return high * 0x100000000 + low;
  }

  getFloat32() {
    const value = this.buffer.readFloatLE(this.offset);
    this.offset += 4;
    return value;
  }

  getFloat32Array(size: number) {
    const a = [];

    for (let i = 0; i < size; i++) {
      a.push(this.getFloat32());
    }

    return a;
  }

  getFloat64() {
    const value = this.buffer.readDoubleLE(this.offset);
    this.offset += 8;
    return value;
  }

  getFloat64Array(size: number) {
    const a = [];

    for (let i = 0; i < size; i++) {
      a.push(this.getFloat64());
    }

    return a;
  }

  getArrayBuffer(size: number) {
    const value = this.buffer.slice(this.offset, this.offset + size);
    this.offset += size;
    return value;
  }

  getString(size: number) {
    const start = this.offset;
    let a = this.buffer.slice(start, start + size);

    this.skip(size);

    const nullByte = a.indexOf(0);
    if (nullByte >= 0) {
      a = this.buffer.slice(start, start + nullByte);
    }

    return String.fromCharCode(...a);
  }
}

// Check if reader has reached the end of content.
export function endOfContent(reader: BinaryReader) {
  // footer size: 160bytes + 16-byte alignment padding
  // - 16bytes: magic
  // - padding til 16-byte alignment (at least 1byte?)
  //	(seems like some exporters embed fixed 15 or 16bytes?)
  // - 4bytes: magic
  // - 4bytes: version
  // - 120bytes: zero
  // - 16bytes: magic
  if (reader.size() % 16 === 0) {
    return ((reader.getOffset() + 160 + 16) & ~0xf) >= reader.size();
  } else {
    return reader.getOffset() + 160 + 16 >= reader.size();
  }
}
