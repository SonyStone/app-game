import { sampleTipSpan, type TipLevel } from './tipSampling';

/** One resolved source span. Coordinates and advances use signed 16.16 units. */
export type TipRasterSpan = {
  offset: number; count: number; x: number; y: number; dx: number; dy: number;
  sampling: Parameters<typeof sampleTipSpan>[1];
  options?: Parameters<typeof sampleTipSpan>[9];
};

/** Receives ordered raster operations without choosing where pixels are stored.
 * byteOffset is the destination view's offset in its allocation and determines
 * the packed axis filter's four-byte alignment. clear uses an exclusive end.
 */
export type TipRasterWriter = {
  byteOffset: number;
  clear: (start: number, end: number) => void;
  span: (span: TipRasterSpan) => void;
};

/** Executes raster operations directly against a caller-owned byte destination. */
export function tipByteWriter(levels: readonly TipLevel[], destination: Uint8Array): TipRasterWriter {
  return {
    byteOffset: destination.byteOffset,
    clear: (start, end) => { destination.fill(0, start, end); },
    span: ({ offset, count, x, y, dx, dy, sampling, options }) => {
      sampleTipSpan(levels, sampling, destination, offset, count, x, y, dx, dy, options);
    }
  };
}
