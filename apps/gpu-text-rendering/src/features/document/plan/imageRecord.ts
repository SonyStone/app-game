/**
 * Field accessors for FORMAT.md `IMAG` records: six little-endian u32 fields per 24-byte record.
 * They allocate nothing and read from a caller-owned `DataView`.
 */

/** Bytes per IMAG record. */
export const imageRecordBytes = 24;

/** Number of records in an IMAG section. */
export function imageCount(table: DataView | ArrayBuffer) {
  return table.byteLength / imageRecordBytes;
}

/** Source width in pixels. */
export function imageWidth(table: DataView, id: number) {
  return table.getUint32(id * imageRecordBytes, true);
}

/** Source height in pixels. */
export function imageHeight(table: DataView, id: number) {
  return table.getUint32(id * imageRecordBytes + 4, true);
}

/** Byte offset of the encoded payload in PIXL. */
export function imagePixelOffset(table: DataView, id: number) {
  return table.getUint32(id * imageRecordBytes + 8, true);
}

/** Stored (encoded) payload length in bytes. */
export function imageByteLength(table: DataView, id: number) {
  return table.getUint32(id * imageRecordBytes + 12, true);
}

/** Interpolation flag: 0 nearest, 1 linear. */
export function imageInterpolation(table: DataView, id: number) {
  return table.getUint32(id * imageRecordBytes + 16, true);
}

/** Codec: 0 raw RGBA, 1 zlib RGBA, 2 JPEG, 3 ICC JPEG, 4 tiled mips. */
export function imageCodec(table: DataView, id: number) {
  return table.getUint32(id * imageRecordBytes + 20, true);
}
