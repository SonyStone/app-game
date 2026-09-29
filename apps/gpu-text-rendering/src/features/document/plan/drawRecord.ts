/**
 * Field accessors for FORMAT.md `DRAW` records (and `CLIP`, which shares the layout).
 *
 * Records are 80 little-endian bytes, matching the renderer's `CurveInstance` storage schema.
 * The accessors are small monomorphic functions over a caller-owned `DataView`: they allocate nothing,
 * so hot per-frame loops can call them directly.
 */

/** Bytes per DRAW/CLIP record. */
export const drawRecordBytes = 80;

/** 32-bit words per DRAW/CLIP record, for `Uint32Array` scans over whole sections. */
export const drawWords = drawRecordBytes / 4;

/** Byte offsets of DRAW fields within one record. */
export const drawOffset = {
  /** f32 × 4 affine `a, b, c, d`. */
  matrix: 0,
  /** f32 × 2 translation `tx, ty`. */
  translation: 16,
  /** u32 one-based CLIP chain reference; zero without an analytic clip. */
  clip: 24,
  /** u32 offset into BINS; zero for a direct segment scan. */
  bins: 28,
  /** u32 first CURV index, or the IMAG index for an image draw. */
  first: 64,
  /** u32 CURV segment count; zero for an image draw. */
  count: 68,
  /** u32 draw kind: fill rule, image or hairline stroke. */
  kind: 72,
  /** u32 page index for DRAW; parent clip reference for CLIP. */
  page: 76
} as const;

/** DRAW kind of an even-odd fill; kinds 0/1 are nonzero/even-odd outline fills. */
export const evenOddKind = 1;
/** DRAW kind of a raster image; `first` then addresses IMAG. */
export const imageKind = 2;
/** First DRAW kind of the one-pixel hairline strokes (3, 4 and 5). */
export const hairlineKind = 3;

/** Number of records in a DRAW or CLIP section. */
export function drawCount(records: DataView) {
  return records.byteLength / drawRecordBytes;
}

/** Affine component `a`, `b`, `c` or `d` (0–3) mapping unit outline coordinates into the page. */
export function drawMatrix(records: DataView, index: number, component: 0 | 1 | 2 | 3) {
  return records.getFloat32(index * drawRecordBytes + drawOffset.matrix + component * 4, true);
}

/** Translation `tx` (0) or `ty` (1) in normalized page coordinates. */
export function drawTranslation(records: DataView, index: number, axis: 0 | 1) {
  return records.getFloat32(index * drawRecordBytes + drawOffset.translation + axis * 4, true);
}

/** One-based analytic clip reference, or zero. */
export function drawClip(records: DataView, index: number) {
  return records.getUint32(index * drawRecordBytes + drawOffset.clip, true);
}

/** First CURV index of an outline, or the IMAG index of an image draw. */
export function drawFirst(records: DataView, index: number) {
  return records.getUint32(index * drawRecordBytes + drawOffset.first, true);
}

/** CURV segment count of an outline. */
export function drawSegments(records: DataView, index: number) {
  return records.getUint32(index * drawRecordBytes + drawOffset.count, true);
}

/** Draw kind: 0/1 outline fill rule, {@link imageKind}, or a hairline kind from {@link hairlineKind}. */
export function drawKind(records: DataView, index: number) {
  return records.getUint32(index * drawRecordBytes + drawOffset.kind, true);
}

/** Page index of a DRAW record, or the parent clip reference of a CLIP record. */
export function drawPage(records: DataView, index: number) {
  return records.getUint32(index * drawRecordBytes + drawOffset.page, true);
}
