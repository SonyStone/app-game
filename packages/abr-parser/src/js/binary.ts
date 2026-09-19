/** Bounded big-endian input. Subreaders cannot consume bytes from neighbouring records. */
export class Reader {
  at = 0;
  private readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get remaining(): number {
    return this.bytes.length - this.at;
  }
  take(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.remaining)
      throw new Error('Truncated binary field');
    const out = this.bytes.subarray(this.at, this.at + length);
    this.at += length;
    return out;
  }
  u8(): number {
    return this.take(1)[0]!;
  }
  u16(): number {
    const at = this.at;
    this.take(2);
    return this.view.getUint16(at);
  }
  i16(): number {
    const at = this.at;
    this.take(2);
    return this.view.getInt16(at);
  }
  u32(): number {
    const at = this.at;
    this.take(4);
    return this.view.getUint32(at);
  }
  i32(): number {
    const at = this.at;
    this.take(4);
    return this.view.getInt32(at);
  }
  u64(): bigint {
    const at = this.at;
    this.take(8);
    return this.view.getBigUint64(at);
  }
  i64(): bigint {
    const at = this.at;
    this.take(8);
    return this.view.getBigInt64(at);
  }
  f64(): number {
    const at = this.at;
    this.take(8);
    return this.view.getFloat64(at);
  }
  count(): number {
    const n = this.u32();
    if (n > 1_000_000) throw new Error('Element count limit');
    return n;
  }
  blob(): Uint8Array {
    const n = this.u32();
    if (n > 268_435_456) throw new Error('Blob limit');
    return this.take(n);
  }
  end(): void {
    if (this.remaining) throw new Error('Unconsumed length-delimited body');
  }
}
/** Chunked writer computes framing lengths without reserving large intermediate buffers. */
export class Writer {
  private readonly chunks: Uint8Array[] = [];
  bytes(value: Uint8Array): void {
    this.chunks.push(value);
  }
  u8(n: number): void {
    this.bytes(Uint8Array.of(n));
  }
  u16(n: number): void {
    this.scalar(2, (v) => v.setUint16(0, n));
  }
  u32(n: number): void {
    this.scalar(4, (v) => v.setUint32(0, n));
  }
  i32(n: number): void {
    this.scalar(4, (v) => v.setInt32(0, n));
  }
  u64(n: bigint): void {
    this.scalar(8, (v) => v.setBigUint64(0, n));
  }
  i64(n: bigint): void {
    this.scalar(8, (v) => v.setBigInt64(0, n));
  }
  f64(n: number): void {
    this.scalar(8, (v) => v.setFloat64(0, n));
  }
  text(value: string): void {
    this.bytes(Uint8Array.from(value, (c) => c.charCodeAt(0)));
  }
  blob(value: Uint8Array): void {
    if (value.length > 268_435_456) throw new Error('Blob limit');
    this.u32(value.length);
    this.bytes(value);
  }
  finish(): Uint8Array {
    const out = new Uint8Array(this.chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
  private scalar(size: number, write: (v: DataView) => void): void {
    const b = new Uint8Array(size);
    write(new DataView(b.buffer));
    this.bytes(b);
  }
}
