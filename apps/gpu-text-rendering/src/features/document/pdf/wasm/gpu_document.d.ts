/* tslint:disable */
/* eslint-disable */
/**
 * Imports a PDF directly into validated render buffers inside a disposable Worker.
 */
export function importPdf(bytes: Uint8Array): DecodeOutcome;
/**
 * Decodes retained PDF CMYK/YCCK without the inversion applied by browser JPEG readers.
 */
export function decodeCmykJpeg(bytes: Uint8Array, width: number, height: number): RasterOutcome;
/**
 * Converts locally inside a disposable Worker; expected PDF failures never throw into JS.
 */
export function convertPdf(bytes: Uint8Array): ConvertOutcome;
/**
 * Decode synchronously inside a dedicated Worker; cancellation terminates that Worker.
 */
export function decodeDocument(bytes: Uint8Array): DecodeOutcome;
/**
 * Owns either the encoded GDOC or a stable error. Free after extraction.
 */
export class ConvertOutcome {
  private constructor();
  free(): void;
  /**
   * Transfers the encoded file once; undefined means conversion failed.
   */
  takeBytes(): Uint8Array | undefined;
  /**
   * Empty on success.
   */
  readonly errorCode: string;
  /**
   * Human-readable detail, including the failing page for unsupported PDF drawing features.
   */
  readonly errorMessage: string;
}
/**
 * Owns either validated data or a typed error. Free after taking the document.
 */
export class DecodeOutcome {
  private constructor();
  free(): void;
  /**
   * Transfers document ownership once. Returns undefined on failure/subsequent calls.
   */
  takeDocument(): DecodedDocument | undefined;
  /**
   * Stable error category; empty on success.
   */
  readonly errorCode: string;
  /**
   * Human-readable details; empty on success.
   */
  readonly errorMessage: string;
}
/**
 * CPU buffers; each `take` transfers a buffer out once. Free after extraction.
 */
export class DecodedDocument {
  private constructor();
  free(): void;
  /**
   * Curve texture width and height, followed by prerender texture width and height.
   */
  dimensions(): Uint32Array;
  /**
   * Exact curve metadata texels.
   */
  takeAtlas(): Uint8Array;
  /**
   * Analytic clipping nodes; an empty buffer means only rectangular clipping.
   */
  takeClips(): Uint8Array;
  /**
   * Flat width/height/first-instance/instance-count tuples, using doubles for exact page dimensions.
   */
  takePages(): Float64Array;
  /**
   * Per-draw compositing modes, with normal blending represented by zero.
   */
  takeBlends(): Uint8Array;
  /**
   * Four vec2f points per monotone cubic.
   */
  takeCurves(): Uint8Array;
  /**
   * Nested isolated transparency groups, 24 bytes per record.
   */
  takeGroups(): Uint8Array;
  /**
   * Six 12-byte vertices per glyph, little-endian.
   */
  takeVertices(): Uint8Array;
  /**
   * Ordered 80-byte affine/color/clip/range records.
   */
  takeInstances(): Uint8Array;
  /**
   * Curve row/column lookup table, addressed by DRAW/CLIP records.
   */
  takeCurveBins(): Uint8Array;
  /**
   * 24-byte image metadata records, empty for profiles 1 and 2.
   */
  takeImageTable(): Uint8Array;
  /**
   * Normalized outline-center x coordinates.
   */
  takePositionsX(): Float32Array;
  /**
   * Normalized outline-center y coordinates, increasing down the page.
   */
  takePositionsY(): Float32Array;
  /**
   * Premultiplied RGBA8 pixels, owned by the caller after extraction.
   */
  takeImagePixels(): Uint8Array;
  /**
   * Vertices for prerendering the small-text coverage atlas.
   */
  takeAtlasVertices(): Uint8Array;
  /**
   * Soft-mask transfer lookup tables, indexed by group record.
   */
  takeMaskTransfers(): Uint8Array;
  /**
   * Analytic radial shading metadata, indexed by image resource.
   */
  takeRadialGradients(): Uint8Array;
  /**
   * Rendering profile: 1 atlas glyphs, 2 cubic contours, 3 contours with raster images.
   */
  readonly profile: number;
}
/**
 * Owns a decoded image or a typed failure; free after taking the pixels.
 */
export class RasterOutcome {
  private constructor();
  free(): void;
  /**
   * Transfers opaque RGBA8 once; undefined indicates failure or a previous transfer.
   */
  takePixels(): Uint8Array | undefined;
  /**
   * Stable error category; empty on success.
   */
  readonly errorCode: string;
  /**
   * Human-readable details; empty on success.
   */
  readonly errorMessage: string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_convertoutcome_free: (a: number, b: number) => void;
  readonly __wbg_decodeddocument_free: (a: number, b: number) => void;
  readonly __wbg_decodeoutcome_free: (a: number, b: number) => void;
  readonly convertPdf: (a: number, b: number) => number;
  readonly convertoutcome_errorCode: (a: number) => [number, number];
  readonly convertoutcome_errorMessage: (a: number) => [number, number];
  readonly convertoutcome_takeBytes: (a: number) => [number, number];
  readonly decodeCmykJpeg: (a: number, b: number, c: number, d: number) => number;
  readonly decodeDocument: (a: number, b: number) => number;
  readonly decodeddocument_dimensions: (a: number) => [number, number];
  readonly decodeddocument_profile: (a: number) => number;
  readonly decodeddocument_takeAtlas: (a: number) => [number, number];
  readonly decodeddocument_takeAtlasVertices: (a: number) => [number, number];
  readonly decodeddocument_takeBlends: (a: number) => [number, number];
  readonly decodeddocument_takeClips: (a: number) => [number, number];
  readonly decodeddocument_takeCurveBins: (a: number) => [number, number];
  readonly decodeddocument_takeCurves: (a: number) => [number, number];
  readonly decodeddocument_takeGroups: (a: number) => [number, number];
  readonly decodeddocument_takeImagePixels: (a: number) => [number, number];
  readonly decodeddocument_takeImageTable: (a: number) => [number, number];
  readonly decodeddocument_takeInstances: (a: number) => [number, number];
  readonly decodeddocument_takeMaskTransfers: (a: number) => [number, number];
  readonly decodeddocument_takePages: (a: number) => [number, number];
  readonly decodeddocument_takePositionsX: (a: number) => [number, number];
  readonly decodeddocument_takePositionsY: (a: number) => [number, number];
  readonly decodeddocument_takeRadialGradients: (a: number) => [number, number];
  readonly decodeddocument_takeVertices: (a: number) => [number, number];
  readonly decodeoutcome_errorCode: (a: number) => [number, number];
  readonly decodeoutcome_errorMessage: (a: number) => [number, number];
  readonly decodeoutcome_takeDocument: (a: number) => number;
  readonly importPdf: (a: number, b: number) => number;
  readonly rasteroutcome_takePixels: (a: number) => [number, number];
  readonly rasteroutcome_errorMessage: (a: number) => [number, number];
  readonly rasteroutcome_errorCode: (a: number) => [number, number];
  readonly __wbg_rasteroutcome_free: (a: number, b: number) => void;
  readonly __wbindgen_export_0: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
