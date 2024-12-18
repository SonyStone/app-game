export class BinaryReader {
  private dv: DataView;
  private offset = 0;
  private littleEndian: boolean | undefined;
  private _textDecoder = new TextDecoder();

  constructor(buffer: ArrayBuffer, littleEndian?: boolean) {
    this.dv = new DataView(buffer);
    this.littleEndian = littleEndian !== undefined ? littleEndian : true;
  }

  getOffset() {
    return this.offset;
  }

  size() {
    return this.dv.buffer.byteLength;
  }

  skip(length: number) {
    this.offset += length;
  }

  // seems like true/false representation depends on exporter.
  // true: 1 or 'Y'(=0x59), false: 0 or 'T'(=0x54)
  // then sees LSB.
  getBoolean() {
    return (this.getUint8() & 1) === 1;
  }

  getBooleanArray(size: number): boolean[] {
    const a: boolean[] = [];

    for (let i = 0; i < size; i++) {
      a.push(this.getBoolean());
    }

    return a;
  }

  getInt16(): number {
    const value = this.dv.getInt16(this.offset, this.littleEndian);
    this.skip(2);
    return value;
  }

  getInt32(): number {
    const value = this.dv.getInt32(this.offset, this.littleEndian);
    this.skip(4);
    return value;
  }

  getInt32Array(size: number): number[] {
    const a: number[] = [];

    for (let i = 0; i < size; i++) {
      a.push(this.getInt32());
    }

    return a;
  }

  getUint8(): number {
    const value = this.dv.getUint8(this.offset);
    this.skip(1);
    return value;
  }

  getUint16(): number {
    const value = this.dv.getUint16(this.offset, this.littleEndian);
    this.skip(2);
    return value;
  }

  getUint32(): number {
    const value = this.dv.getUint32(this.offset, this.littleEndian);
    this.skip(4);
    return value;
  }

  // JavaScript doesn't support 64-bit integer so calculate this here
  // 1 << 32 will return 1 so using multiply operation instead here.
  // There's a possibility that this method returns wrong value if the value
  // is out of the range between Number.MAX_SAFE_INTEGER and Number.MIN_SAFE_INTEGER.
  // TODO: safely handle 64-bit integer
  getInt64(): number {
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

  getInt64Array(size: number): number[] {
    const a: number[] = [];

    for (let i = 0; i < size; i++) {
      a.push(this.getInt64());
    }

    return a;
  }

  // Note: see getInt64() comment
  getUint64(): number {
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

  getFloat32(): number {
    const value = this.dv.getFloat32(this.offset, this.littleEndian);
    this.skip(4);
    return value;
  }

  getFloat32Array(size: number): number[] {
    const a: number[] = [];

    for (let i = 0; i < size; i++) {
      a.push(this.getFloat32());
    }

    return a;
  }

  getFloat64(): number {
    const value = this.dv.getFloat64(this.offset, this.littleEndian);
    this.skip(8);
    return value;
  }

  getFloat64Array(size: number): number[] {
    const a = [];

    for (let i = 0; i < size; i++) {
      a.push(this.getFloat64());
    }

    return a;
  }

  getArrayBuffer(size: number): ArrayBuffer {
    const value = this.dv.buffer.slice(this.offset, this.offset + size);
    this.skip(size);
    return value;
  }

  getString(size: number): string {
    const start = this.offset;
    let a = new Uint8Array(this.dv.buffer, start, size);

    this.skip(size);

    // const nullByte = a.indexOf(0);
    // if (nullByte >= 0) {
    //   a = new Uint8Array(this.dv.buffer, start, nullByte);
    // }

    return this._textDecoder.decode(a);
  }
}
