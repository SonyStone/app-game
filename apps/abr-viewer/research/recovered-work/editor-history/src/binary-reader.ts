/**
 * Binary Reader - Universal reader for both Node.js and browser
 * Supports big-endian reading for Photoshop file formats
 */

export class BinaryReader {
  private data: DataView;
  private bytes: Uint8Array;
  private offset: number = 0;

  constructor(buffer: ArrayBuffer | Uint8Array | ArrayBufferView) {
    // Normalize to Uint8Array (works in both Node.js and browser)
    if (buffer instanceof ArrayBuffer) {
      this.bytes = new Uint8Array(buffer);
      this.data = new DataView(buffer);
    } else if (buffer instanceof Uint8Array) {
      this.bytes = buffer;
      this.data = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else {
      // ArrayBufferView (including Node.js Buffer which extends Uint8Array)
      this.bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      this.data = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
  }

  get position(): number {
    return this.offset;
  }

  get length(): number {
    return this.bytes.length;
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  seek(offset: number): void {
    if (offset < 0 || offset > this.bytes.length) {
      throw new Error(`Invalid seek offset: ${offset}, buffer length: ${this.bytes.length}`);
    }
    this.offset = offset;
  }

  skip(bytes: number): void {
    this.offset += bytes;
  }

  peek(bytes: number): Uint8Array {
    return this.bytes.subarray(this.offset, this.offset + bytes);
  }

  readBytes(length: number): Uint8Array {
    const result = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  readUInt8(): number {
    const value = this.data.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readInt8(): number {
    const value = this.data.getInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readUInt16BE(): number {
    const value = this.data.getUint16(this.offset, false);
    this.offset += 2;
    return value;
  }

  readInt16BE(): number {
    const value = this.data.getInt16(this.offset, false);
    this.offset += 2;
    return value;
  }

  readUInt32BE(): number {
    const value = this.data.getUint32(this.offset, false);
    this.offset += 4;
    return value;
  }

  readInt32BE(): number {
    const value = this.data.getInt32(this.offset, false);
    this.offset += 4;
    return value;
  }

  readDoubleBE(): number {
    const value = this.data.getFloat64(this.offset, false);
    this.offset += 8;
    return value;
  }

  readFloatBE(): number {
    const value = this.data.getFloat32(this.offset, false);
    this.offset += 4;
    return value;
  }

  /**
   * Read a fixed-length ASCII string
   */
  readString(length: number): string {
    const bytes = this.readBytes(length);
    // Find null terminator
    let end = bytes.indexOf(0);
    if (end === -1) end = length;
    // Convert to string without Buffer.toString()
    return String.fromCharCode(...bytes.subarray(0, end));
  }

  /**
   * Read a Pascal string (1-byte length prefix)
   */
  readPascalString(): string {
    const length = this.readUInt8();
    if (length === 0) return '';
    return this.readString(length);
  }

  /**
   * Read a Unicode string (4-byte length prefix, big-endian UTF-16)
   */
  readUnicodeString(): string {
    const length = this.readUInt32BE();
    if (length === 0) return '';
    
    const chars: string[] = [];
    for (let i = 0; i < length; i++) {
      const charCode = this.readUInt16BE();
      if (charCode !== 0) {
        chars.push(String.fromCharCode(charCode));
      }
    }
    return chars.join('');
  }

  /**
   * Read a Photoshop-style ID (4-byte or length-prefixed)
   */
  readId(): string {
    const length = this.readUInt32BE();
    if (length === 0) {
      // 4-byte key
      return this.readString(4);
    }
    return this.readString(length);
  }

  /**
   * Check if we're at or past the end of the buffer
   */
  isEof(): boolean {
    return this.offset >= this.bytes.length;
  }

  /**
   * Get a slice of the buffer from current position
   */
  slice(length: number): Uint8Array {
    return this.bytes.subarray(this.offset, this.offset + length);
  }

  /**
   * Create a new reader from a slice of this buffer
   */
  subReader(length: number): BinaryReader {
    const subBuffer = this.readBytes(length);
    return new BinaryReader(subBuffer);
  }
}
