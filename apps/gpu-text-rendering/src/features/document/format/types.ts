import type { DocumentError } from '../../../shared/errors';
import type { CoverageTables } from '../rendering/curves/buildCoverageTables';
import type { buildCurvePreparation } from '../rendering/curves/buildCurvePreparation';

/** Validated CPU data from the Rust decoder, before viewer layout or GPU allocation. */
export type DecodedDocument = {
  pages: { width: number; height: number; beginVertex: number; endVertex: number; images: [] }[];
  positions: { x: Float32Array<ArrayBuffer>; y: Float32Array<ArrayBuffer> };
} & (
  | {
      kind: 'glyphs';
      /** Omitted for legacy six-vertex callers; file loaders return lossless 28-byte instances. */
      glyphEncoding?: 'instances';
      glyphVertices: ArrayBuffer;
      atlas: { buf: ArrayBuffer; width: number; height: number };
      atlasVertices: { buf: ArrayBuffer; width: number; height: number };
    }
  | {
      kind: 'curves';
      /** Precomputed in the loading Worker and consumed by GPU preparation; optional for programmatic scenes. */
      coverage?: CoverageTables;
      /** Worker-built paint plans and lookup buffers, consumed on first renderer preparation. */
      preparation?: ReturnType<typeof buildCurvePreparation>;
      curves: ArrayBuffer;
      instances: ArrayBuffer;
      /** Analytic clip chains and curve lookup tables; empty for older files. */
      clips: ArrayBuffer;
      curveBins: ArrayBuffer;
      /** One compositing byte per drawing instance. */
      blends: ArrayBuffer;
      /** Nested isolated transparency groups in paint order. */
      groups: ArrayBuffer;
      /** Group-indexed soft-mask transfer functions, empty for identity masks. */
      maskTransfers: ArrayBuffer;
      /** Analytic radial geometry indexed by image resource; color ramps remain raster resources. */
      radialGradients: ArrayBuffer;
      /** Validated IMAG records and encoded raster resources, including optional tiled mip pyramids. */
      rasterImages: { table: ArrayBuffer; pixels: ArrayBuffer };
    }
);

/** Transferable worker envelope; neverthrow class instances do not survive structured cloning. */
export type DecodeReply = { ok: true; value: DecodedDocument } | { ok: false; error: DocumentError };
