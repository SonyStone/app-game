/**
 * Binary Writer - Big-endian writer for Photoshop file formats
 */

export class BinaryWriter {
  private chunks: Uint8Array[] = [];
  private currentChunk: Uint8Array;
  private offset: number = 0;
  private chunkSize: number = 4096;

  constructor(initialSize: number = 4096) {
    this.chunkSize = initialSize;
    this.currentChunk = new Uint8Array(this.chunkSize);
  }

  private ensureCapacity(bytes: number): void {
    if (this.offset + bytes > this.currentChunk.length) {
      // Save current chunk and create a new one
      this.chunks.push(this.currentChunk.subarray(0, this.offset));
      this.currentChunk = new Uint8Array(Math.max(this.chunkSize, bytes));
      this.offset = 0;
    }
  }

  /**
   * Write raw bytes
   */
  writeBytes(data: Uint8Array | number[]): void {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    this.ensureCapacity(bytes.length);
    this.currentChunk.set(bytes, this.offset);
    this.offset += bytes.length;
  }

  /**
   * Write a single byte (unsigned 8-bit)
   */
  writeUInt8(value: number): void {
    this.ensureCapacity(1);
    this.currentChunk[this.offset++] = value & 0xff;
  }

  /**
   * Write signed 8-bit integer
   */
  writeInt8(value: number): void {
    this.writeUInt8(value < 0 ? 256 + value : value);
  }

  /**
   * Write unsigned 16-bit big-endian integer
   */
  writeUInt16BE(value: number): void {
    this.ensureCapacity(2);
    this.currentChunk[this.offset++] = (value >> 8) & 0xff;
    this.currentChunk[this.offset++] = value & 0xff;
  }

  /**
   * Write signed 16-bit big-endian integer
   */
  writeInt16BE(value: number): void {
    this.writeUInt16BE(value < 0 ? 65536 + value : value);
  }

  /**
   * Write unsigned 32-bit big-endian integer
   */
  writeUInt32BE(value: number): void {
    this.ensureCapacity(4);
    this.currentChunk[this.offset++] = (value >> 24) & 0xff;
    this.currentChunk[this.offset++] = (value >> 16) & 0xff;
    this.currentChunk[this.offset++] = (value >> 8) & 0xff;
    this.currentChunk[this.offset++] = value & 0xff;
  }

  /**
   * Write signed 32-bit big-endian integer
   */
  writeInt32BE(value: number): void {
    this.writeUInt32BE(value >>> 0);
  }

  /**
   * Write 64-bit big-endian double
   */
  writeDoubleBE(value: number): void {
    this.ensureCapacity(8);
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, value, false); // big-endian
    const bytes = new Uint8Array(buffer);
    this.currentChunk.set(bytes, this.offset);
    this.offset += 8;
  }

  /**
   * Write 32-bit big-endian float
   */
  writeFloatBE(value: number): void {
    this.ensureCapacity(4);
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setFloat32(0, value, false); // big-endian
    const bytes = new Uint8Array(buffer);
    this.currentChunk.set(bytes, this.offset);
    this.offset += 4;
  }

  /**
   * Write a fixed-length ASCII string (pads with zeros if shorter)
   */
  writeString(str: string, length?: number): void {
    const actualLength = length ?? str.length;
    this.ensureCapacity(actualLength);
    for (let i = 0; i < actualLength; i++) {
      this.currentChunk[this.offset++] = i < str.length ? str.charCodeAt(i) : 0;
    }
  }

  /**
   * Write a Pascal string (1-byte length prefix)
   */
  writePascalString(str: string): void {
    const length = Math.min(str.length, 255);
    this.writeUInt8(length);
    this.writeString(str, length);
  }

  /**
   * Write a Unicode string (4-byte length prefix, big-endian UTF-16)
   */
  writeUnicodeString(str: string): void {
    this.writeUInt32BE(str.length);
    for (let i = 0; i < str.length; i++) {
      this.writeUInt16BE(str.charCodeAt(i));
    }
  }

  /**
   * Write a Photoshop TEXT value (Unicode string with null terminator)
   * TEXT values include the null terminator in their length count
   */
  writeTextValue(str: string): void {
    this.writeUInt32BE(str.length + 1); // +1 for null terminator
    for (let i = 0; i < str.length; i++) {
      this.writeUInt16BE(str.charCodeAt(i));
    }
    this.writeUInt16BE(0); // null terminator
  }

  /**
   * Write a Photoshop descriptor class name (Unicode string)
   * For empty class names, Photoshop uses length=1 with a single null char (0x0000)
   */
  writeClassName(str: string): void {
    if (str.length === 0) {
      // Empty class name: write length=1 and a single null char
      this.writeUInt32BE(1);
      this.writeUInt16BE(0);
    } else {
      this.writeUnicodeString(str);
    }
  }

  /**
   * Write a Photoshop-style ID (4-byte or length-prefixed)
   */
  writeId(id: string): void {
    if (id.length === 4) {
      // 4-byte key
      this.writeUInt32BE(0);
      this.writeString(id, 4);
    } else {
      // Length-prefixed
      this.writeUInt32BE(id.length);
      this.writeString(id, id.length);
    }
  }

  /**
   * Write padding bytes (zeros)
   */
  writePadding(bytes: number): void {
    this.ensureCapacity(bytes);
    for (let i = 0; i < bytes; i++) {
      this.currentChunk[this.offset++] = 0;
    }
  }

  /**
   * Pad to 4-byte boundary
   */
  padTo4ByteBoundary(): void {
    const totalSize = this.getTotalSize();
    const padding = (4 - (totalSize % 4)) % 4;
    if (padding > 0) {
      this.writePadding(padding);
    }
  }

  /**
   * Get total size of all written data
   */
  getTotalSize(): number {
    let size = 0;
    for (const chunk of this.chunks) {
      size += chunk.length;
    }
    return size + this.offset;
  }

  /**
   * Get the final buffer
   */
  toBuffer(): Uint8Array {
    // Collect all chunks
    const totalSize = this.getTotalSize();
    const result = new Uint8Array(totalSize);
    
    let pos = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }
    
    // Add remaining data from current chunk
    if (this.offset > 0) {
      result.set(this.currentChunk.subarray(0, this.offset), pos);
    }
    
    return result;
  }

  /**
   * Get current write position
   */
  get position(): number {
    return this.getTotalSize();
  }
}
