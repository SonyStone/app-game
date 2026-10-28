/* tslint:disable */
/* eslint-disable */
/**
 * Converts measured modern major-axis caches and segment indices into schema 7.
 * Vertical caches require zero major origins and retain source layout and glyph IDs. Metric-box
 * rotation uses binary32 arithmetic. Malformed packets, unsupported layouts or font contexts throw.
 * Supply actual face versions as for `projectTypeEngineSave26`. Returns a diagnostic engine packet;
 * it does not shape text, compute vertical font geometry or authorize edited saves.
 */
export function projectTypeEngineLayoutCache26(bytes: Uint8Array, fonts: TypeEngineFontVersion[]): Uint8Array;
/**
 * Converts measured horizontal SelectionPoints and positioned origins into legacy pen and mark
 * arrays, including a supplied uniform shadow scale for strike descent. This imports source
 * caches. It does not shape text, reconstruct missing font context, or authorize edited saves.
 */
export function projectTypeEngineSelection26(bytes: Uint8Array, fonts: TypeEngineFontVersion[]): Uint8Array;
/**
 * Projects measured schema-13/14 horizontal cached engine data into save schema 7 for compatibility
 * comparison. This is a diagnostic candidate. It does not produce local TySh descriptors, validate
 * import/layout state, shape glyphs or authorize editor saves. Missing face-context entries retain
 * document identities. Supply actual face versions, never guesses based only on PostScript names.
 * Unsupported versions, duplicate identities and nonhorizontal cached data throw.
 */
export function projectTypeEngineSave26(bytes: Uint8Array, fonts: TypeEngineFontVersion[]): Uint8Array;
/**
 * Converts modern horizontal cache origins through the native visual-origin addition before
 * projecting schema 13/14. This converts stored coordinates, never shapes glyphs. Remaining
 * import/layout dependencies still require comparison; no editor admission changes.
 */
export function projectTypeEngineGeometry26(bytes: Uint8Array, fonts: TypeEngineFontVersion[]): Uint8Array;
/**
 * Writes current engine values using Photoshop 26's binary32 decimals and canonical whitespace.
 * Does not import a layout, resolve fonts or authorize an edited PSD/PSB save. The original bytes
 * remain unchanged. Malformed packets and unsupported scalar/array encodings throw.
 */
export function writeTypeEngineValues26(bytes: Uint8Array): Uint8Array;
/**
 * Formats one finite binary32 engine real. Values beyond the measured native magnitude throw.
 */
export function formatTypeEngineReal26(value: number): Uint8Array;
/**
 * Accumulates nominal hmtx advances with explicit shaped design adjustments and point spacing.
 * Supply glyph IDs, signed design-unit adjustments and point spacing with equal lengths, plus a
 * size in 0.5..=32767 points. Returns one binary32 point pen per glyph and a terminal pen, starting
 * at zero. Base and spacing sums accumulate separately. Invalid operands or font programs throw.
 * Does not perform shaping, kerning, host font lookup or choose terminal tracking or save admission.
 */
export function computeTypeHorizontalPens26(bytes: Uint8Array, face_index: number, glyphs: Uint16Array, size: number, adjustments: Int32Array, spacing: Float32Array): Float32Array;
/**
 * Computes ordinary TrueType box/point baselines from supplied bytes and explicit manual leading.
 * The caller establishes line breaks; `count` is at most 1,000,000 and `leading` is finite/positive.
 * Size must be in 0.5..=32767 points.
 * Box text starts at the normalized lowercase-d baseline; point text starts at zero. Returns local
 * binary32 point coordinates. Invalid operands, missing markers and unsupported contexts throw.
 * Does not choose automatic leading, shape text, query host fonts or authorize edited saves.
 */
export function computeTypeManualBaselines26(bytes: Uint8Array, face_index: number, size: number, leading: number, count: number, boxed: boolean): Float32Array;
/**
 * Computes local y-down ink from exact supplied font bytes and already positioned glyph IDs.
 * Standard TrueType hinting only. Missing fonts, variable/CFF faces, nonfinite values and
 * unsupported outline programs throw. Does not shape text or authorize a document save.
 */
export function computeTypeGlyphInk26(fonts: TypeGlyphFont26[], glyphs: TypePositionedGlyph26[], tx: number, ty: number): Float32Array;
/**
 * Computes supplied-font ink and returns a complete diagnostic TySh candidate in explicit
 * points units. Supply `unitsPerPixel = 72 / resolution`. Other import/layout properties remain
 * source-dependent; a returned packet is not an editor admission certificate.
 */
export function writeTypeLayerGlyphs26(bytes: Uint8Array, fonts: TypeGlyphFont26[], glyphs: TypePositionedGlyph26[], units_per_pixel: number): Uint8Array;
/**
 * Reads native-normalized OS/2 metric words from explicit static TrueType bytes.
 * Returns typo ascent/descent/gap, cap and x-height, with absent fields represented as null.
 */
export function readTypeFontMetrics26(bytes: Uint8Array, face_index: number): any;
/**
 * Reads the raster layers of an RGB, Grayscale or Bitmap PSD or PSB at any depth, groups flattened.
 */
export function readPsd(bytes: Uint8Array): any;
/**
 * Rasterizes one upright stem-free CFF2 glyph with Strong AA at 13.375..47.5625 px.
 * The caller supplies actual single-face OTTO font bytes, a complete signed 16.16 design tuple
 * in fvar order and a finite baseline origin within +/-100000 pixels. Font input is at most 64 MiB.
 * No font lookup, shaping, HVAR or paint occurs.
 * Hints, masks, flex/arithmetic programs, multiple FDs, transforms and other AA methods refuse.
 * Returns coverage and document-space bounds only. This does not admit CFF2 to addTextFont or SetText.
 */
export function rasterizeCff2Strong(font_bytes: Uint8Array, design_coordinates: readonly number[], character: string, size: number, origin_x: number, origin_y: number): PsdCff2Coverage;
/**
 * Reads persisted styles, vectors, locks, labels, metadata and XMP without renderer admission.
 * Vector frame queries are separate from stored values and report malformed-name/rectangle refusals.
 * Optional fields are null when absent or differently tagged. Unknown descriptor leaves stay in sourceBlock.
 * Physical record indices refer to the selected layer-info section and change after structural edits.
 */
export function readPsdSource(bytes: Uint8Array): PsdSourceSnapshot;
/**
 * Reads the bounded J-metadata query model. Missing scalars use confirmed defaults 30 and 1.
 * Refused carriers return null plus an explicit reason. File Info may contain independently
 * admitted fields and field-specific refusals. This does not edit source, infer comp selection,
 * reconcile copyright or normalize a document for saving.
 */
export function readPsdMetadataQueries(bytes: Uint8Array): PsdMetadataQueries;

/** Native region settings, sharing the existing viewer render semantics. */
export interface PsdNativeRenderOptions {
  /** Default false. */
  approximate?: boolean;
  linearBlending?: boolean;
  textGamma?: number | null;
  grayProfile?: Uint8Array;
  vectorPaths?: boolean;
  typeLayers?: boolean;
  availableFonts?: string[];
  smartObjects?: 'nearestNeighbor' | 'bilinear' | 'bicubic' | 'bicubicSmoother' | 'bicubicSharper' | 'bicubicAutomatic';
  visibility?: Array<[number, boolean]>;
  state?: { frame: number } | { comp: number } | null;
  /** Default 16,777,216 work pixels. */
  maxWorkPixels?: number;
  budget?: PsdBudgetOptions;
}
/** Storage preflight. This does not certify semantic strict-render support. */
export interface PsdRegionCapability {
  strategy: 'window' | 'fullCanvas'; allocationBytes: bigint; liveBytes: bigint; sourceWorkPixels: bigint;
  causes: Array<{ layer: number | null; kind: 'NativeDomain' | 'Layerless' | 'StoredComposite' |
    'GeneratedGeometry' | 'RerenderedContent' | 'PassThroughFill' | 'HueSaturation' | 'NativeStyle' | 'GroupKnockout' }>;
  refusal: Error | PsdBudgetError | null;
}
/** Straight native composite samples. Process arrays include alpha after the color channels. */
export type PsdNativeRender = PsdNativeRect & {
  strategy: 'window' | 'fullCanvas'; approximations: string[]; channels: number;
} & ({ encoding: 'rgba8'; depth: 8; samples: Uint8Array } |
 { encoding: 'rgba16-internal'; depth: 16; samples: Uint16Array } |
 { encoding: 'rgba-f32-bits'; depth: 32; samples: Uint32Array } |
 { encoding: 'process-internal'; depth: 8 | 16; samples: Uint16Array });



/** Document-space rectangle. Input windows must be nonempty; clipped channel results may be empty. */
export interface PsdNativeRect { left: number; top: number; width: number; height: number }
/** Original native samples, without unmatting, color conversion or mask application. */
export interface PsdNativeRegion {
  depth: 1 | 8 | 16 | 32;
  mode: number;
  encoding: 'big-endian-wire';
  source: 'savedComposite' | 'layerChannels';
  /** IDs are saved plane indices, or layer channel IDs including -2/-3 masks. */
  planes: Array<PsdNativeRect & { id: number; bytes: Uint8Array }>;
}
/** Original path identity with a validated geometry projection or a per-path refusal. */
export type PsdSavedPath = {
  resourceId: number | null; namedIndex: number | null;
  legacyName: Uint8Array; unicodeName: Uint16Array | null;
  companionStream: boolean; tail: Uint8Array;
} & ({ outcome: 'refused'; error: Error } | {
  outcome: 'geometry'; components: Array<{
    operation: number; fillRule: number;
    subpaths: Array<{ recordIndex: number; closed: boolean; originationIndex: number;
      knots: Array<{ selector: number; q24YX: number[][];
        before: number[]; anchor: number[]; after: number[] }> }>;
  }>;
});



/** An actual face-context leaf for diagnostic engine serialization. No font lookup is performed. */
export interface TypeEngineFontVersion {
    /** Exact document PostScript name. The caller binds the program and design coordinates. */
    name: string;
    /** Actual current face version string. A name-based guess is invalid. */
    version: string;
}



/** Exact caller-supplied static TrueType program, read in place by the caller. */
export interface TypeGlyphFont26 {
    /** Exact font program bytes; no host lookup or fallback is performed. */
    bytes: Uint8Array;
    /** Zero-based TTC face index, or zero for a standalone sfnt font. */
    faceIndex: number;
}
/** Glyph after caller-established shaping, mark positioning and line layout, in local points. */
export interface TypePositionedGlyph26 {
    /** Index into the supplied TypeGlyphFont26 array. */
    font: number;
    /** Font-specific glyph ID from caller-established shaping. */
    glyph: number;
    /** Effective outline size in points, including caller-established scaling. */
    size: number;
    /** Exact binary32 local baseline x, including caller-established mark placement. */
    x: number;
    /** Exact binary32 local baseline y, including caller-established mark placement. */
    y: number;
}



/** Stored vector carriers. Missing fields stay null; unknown entries and suffixes stay in sourceBlock.
 * This inspection admits no new line/star/frame edit, generated geometry or stroke rendering. */
export interface PsdVectorSource {
  readonly origin: { readonly sourceBlock: Uint8Array; readonly version: number | null; readonly origins: readonly VectorOrigin[] | null } | null;
  readonly stroke: { readonly sourceBlock: Uint8Array; readonly settings: VectorStrokeSource | null } | null;
  readonly frame: { readonly sourceBlock: Uint8Array; readonly settings: VectorFrameSettings; readonly query: FrameQuery } | null;
}
/** Bounded native import view, independent of source values. A refusal is null plus its error. */
export interface FrameQuery {
  /** Rounded and int32-saturated Left/Top/Right/Bottom; nonpixel/nonfinite coordinates refuse. */ readonly bounds: readonly number[] | null;
  readonly boundsError: string | null;
  /** Explicit types 2/3/4, otherwise 1; absent stays null. */ readonly kind: number | null;
  /** Decoded terminated UTF-16 name; malformed encodings refuse. */ readonly name: string | null;
  readonly nameError: string | null;
}
/** Stored Origin; tags, units and absence are preserved independently of runtime geometry. */
export interface VectorOrigin {
  /** Source list ordinal, never substituted for an explicit index. */ readonly ordinal: number;
  /** Original `keyOriginType`, not an authorization to synthesize that shape. */ readonly kind: number | null;
  /** Explicit subpath/origination link. */ readonly index: number | null;
  /** Explicit invalidation flag; absence remains distinct. */ readonly invalidated: boolean | null;
  /** Serialized authoring resolution, independent of document and stroke resolution. */ readonly resolution: SourceNumber | null;
  /** Stored rectangle; world coordinates must not receive the transform a second time. */ readonly bounds: VectorQuad | null;
  /** Stored rounded-rectangle radii, preserving units per corner. */ readonly radii: VectorQuad | null;
  /** Stored transform, not automatically applied to the serialized path. */ readonly transform: VectorTransform | null;
  /** World-space corners in A/B/C/D order. */ readonly corners: VectorCorners | null;
  /** Line-family source parameters, independent of regenerated path geometry. */ readonly line: VectorLineSource | null;
  /** Polygon-family explicit parameters. Other future extensions remain retained source. */ readonly polygon: VectorPolygonSource | null;
}
/** Stored Quad; tags, units and absence are preserved independently of runtime geometry. */
export interface VectorQuad {
  /** Bounds Left/Top/Right/Bottom, or radii TL/TR/BR/BL. */ readonly values: readonly (SourceNumber | null)[];
  /** Original `unitValueQuadVersion`. */ readonly version: number | null;
}
/** Stored Transform; tags, units and absence are preserved independently of runtime geometry. */
export interface VectorTransform {
  /** Original numeric leaves with their units and tags. */ readonly values: readonly (SourceNumber | null)[];
}
/** Stored Point; tags, units and absence are preserved independently of runtime geometry. */
export interface VectorPoint {
  /** Horizontal coordinate. */ readonly horizontal: SourceNumber | null;
  /** Vertical coordinate. */ readonly vertical: SourceNumber | null;
}
/** Stored Corners; tags, units and absence are preserved independently of runtime geometry. */
export interface VectorCorners {
  /** Ordered source corners. */ readonly points: readonly (VectorPoint | null)[];
}
/** Stored LineSource; tags, units and absence are preserved independently of runtime geometry. */
export interface VectorLineSource {
  /** Stored endpoints with independent coordinate tags and units. */ readonly start: VectorPoint | null;
  /** Stored endpoint; native transforms may change the imported query separately. */ readonly end: VectorPoint | null;
  /** Stored line weight, separate from modern stroke width. */ readonly weight: SourceNumber | null;
  /** Explicit start-arrow enablement. */ readonly arrowStart: boolean | null;
  /** Explicit end-arrow enablement. */ readonly arrowEnd: boolean | null;
  /** Stored arrow width; the optional flag determines its authoring unit context. */ readonly arrowWidth: SourceNumber | null;
  /** Stored arrow length; the optional flag determines its authoring unit context. */ readonly arrowLength: SourceNumber | null;
  /** Stored concavity, preserving the integer versus double distinction. */ readonly arrowConcavity: SourceNumber | null;
  /** Explicit pixel-unit flag for arrow width; absence stays absent. */ readonly widthPixels: boolean | null;
  /** Explicit pixel-unit flag for arrow length; absence stays absent. */ readonly lengthPixels: boolean | null;
}
/** Stored PolygonSource; tags, units and absence are preserved independently of runtime geometry. */
export interface VectorPolygonSource {
  /** Stored side count. Native import clamps this to 3..100. */ readonly sides: number | null;
  /** Stored star percentage; native ratio divides by 100. */ readonly starRatio: SourceNumber | null;
  /** Explicit smoothing controls. */ readonly smoothCorners: boolean | null;
  /** Explicit indent smoothing. */ readonly smoothIndent: boolean | null;
  /** Stored corner radius. */ readonly radius: SourceNumber | null;
  /** Integer radius-unit selector, not a descriptor FourCC unit. */ readonly radiusUnit: number | null;
  /** Stored horizontal pixel scale. */ readonly pixelHsf: SourceNumber | null;
  /** Explicit inner radius; native derived radii remain separate. */ readonly innerRadius: SourceNumber | null;
  /** Integer authoring unit selector for the inner radius. */ readonly innerRadiusUnit: number | null;
  /** Explicit outer radius, without regenerating a star or polygon. */ readonly outerRadius: SourceNumber | null;
  /** Integer authoring unit selector for the outer radius. */ readonly outerRadiusUnit: number | null;
  /** Retained maximum inner corner radius, not a computed limit. */ readonly maxInnerCornerRadius: SourceNumber | null;
  /** Retained maximum outer corner radius, not a computed limit. */ readonly maxOuterCornerRadius: SourceNumber | null;
  /** Explicit predicted inner radius; sentinel values are not interpreted. */ readonly predictedInnerRadius: SourceNumber | null;
  /** Explicit predicted outer radius; sentinel values are not interpreted. */ readonly predictedOuterRadius: SourceNumber | null;
  /** Explicit authoring flag selecting the source outer corner radius. */ readonly sourceOuterCornerRadius: boolean | null;
  /** Explicit linkage of star corner radii. */ readonly linkCornerRadius: boolean | null;
  /** Previous tight world corners. */ readonly previous: VectorCorners | null;
  /** True rectangular world corners. */ readonly trueCorners: VectorCorners | null;
}
/** Stored FrameSettings; tags, units and absence are preserved independently of runtime geometry. */
export interface VectorFrameSettings {
  /** Stored Left/Top/Right/Bottom before native integer rounding. */ readonly bounds: VectorQuad | null;
  /** Original type; native import maps unsupported types to 1. */ readonly kind: number | null;
  /** Explicit PPI lock, without assuming the constructor default. */ readonly lockPpi: boolean | null;
  /** Explicit preferred resolution, independent of document resolution. */ readonly preferredResolution: SourceNumber | null;
  /** Exact UTF-16 units including the source terminator when present. */ readonly savedName: Uint16Array | null;
  /** Explicit resolution of a descriptor path; the path itself remains in `stored`. */ readonly pathResolution: SourceNumber | null;
}
/** Stored StrokeSource; tags, units and absence are preserved independently of runtime geometry. */
export interface VectorStrokeSource {
  /** Explicit `strokeEnabled`, without inserting a runtime default. */ readonly strokeEnabled: boolean | null;
  /** Explicit `enabled`, without inserting a runtime default. */ readonly enabled: boolean | null;
  /** Explicit `fillEnabled`, without inserting a runtime default. */ readonly fillEnabled: boolean | null;
  /** Explicit `strokeStyleStrokeOnly`, without inserting a runtime default. */ readonly strokeStyleStrokeOnly: boolean | null;
  /** Explicit `strokeStyleScaleLock`, without inserting a runtime default. */ readonly strokeStyleScaleLock: boolean | null;
  /** Explicit `strokeStyleStrokeAdjust`, without inserting a runtime default. */ readonly strokeStyleStrokeAdjust: boolean | null;
  /** Explicit `strokeStyleLineWidth`, without inserting a runtime default. */ readonly strokeStyleLineWidth: SourceNumber | null;
  /** Explicit `strokeStyleLineDashOffset`, without inserting a runtime default. */ readonly strokeStyleLineDashOffset: SourceNumber | null;
  /** Explicit `strokeStyleMiterLimit`, without inserting a runtime default. */ readonly strokeStyleMiterLimit: SourceNumber | null;
  /** Explicit `strokeStyleOpacity`, without inserting a runtime default. */ readonly strokeStyleOpacity: SourceNumber | null;
  /** Explicit `strokeStyleResolution`, without inserting a runtime default. */ readonly strokeStyleResolution: SourceNumber | null;
  /** Explicit `strokeStyleLineCapType`, without inserting a runtime default. */ readonly strokeStyleLineCapType: SourceEnum | null;
  /** Explicit `strokeStyleLineJoinType`, without inserting a runtime default. */ readonly strokeStyleLineJoinType: SourceEnum | null;
  /** Explicit `strokeStyleLineAlignment`, without inserting a runtime default. */ readonly strokeStyleLineAlignment: SourceEnum | null;
  /** Explicit `strokeStyleBlendMode`, without inserting a runtime default. */ readonly strokeStyleBlendMode: SourceEnum | null;
  /** Explicit `strokeStyleVersion`, without inserting a runtime default. */ readonly strokeStyleVersion: number | null;
  /** Every dash slot, including a retained-only malformed slot represented by None. */ readonly dashes: readonly (SourceNumber | null)[] | null;
  /** Explicit paint, selected by its object class. */ readonly paint: VectorStrokePaint | null;
}
/** Stored PaintSource; tags, units and absence are preserved independently of runtime geometry. */
export interface VectorPaintSource {
  /** Color, gradient stops, pattern, phase, offset and paint flags. Unknown entries stay in VectorSource. */ readonly settings: SourceSettings;
  /** Explicit gradient aspect ratio. */ readonly aspect: SourceNumber | null;
  /** Source color-book identifier, independent of displayed process values. */ readonly bookId: number | null;
  /** Original color-book name UTF16, including termination. */ readonly bookName: Uint16Array | null;
  /** Original named color UTF16, including termination. */ readonly colorName: Uint16Array | null;
  /** Source color-book key bytes. */ readonly bookKey: Uint8Array | null;
}
/** Typed paint or an explicitly retained unknown class; rendering remains separately gated. */
export type VectorStrokePaint =
  | { readonly kind: 'solid' | 'gradient' | 'pattern'; readonly settings: VectorPaintSource }
  | { readonly kind: 'retained'; readonly settings: null; readonly class: Uint8Array };



/** Isolated Strong glyph coverage. Bounds are document-space pixels; no paint, layout or editor cache is produced. */
export interface PsdCff2Coverage {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly alpha: Uint8Array;
  readonly glyphIndex: number;
  /** Signed 16.16 fvar/avar coordinates, distinct from the supplied design tuple. */
  readonly normalizedCoordinates: readonly number[];
}



/**
 * Caller-owned facts for the first save of a new flat RGB8 raster document.
 * Every operand is required. Supply truthful application, profile and compositor facts.
 * Creation is separate from imported-file preservation and later editor saves.
 */
export interface PsdNewDocumentContext {
  /** Creation facts retained independently of later save events. */
  readonly creation: {
    /** Cryptographic UUID with the xmp.did: prefix. */
    readonly originalDocumentId: string;
    /** Created-event UUID with the xmp.iid: prefix, sharing the original creation UUID. */
    readonly instanceId: string;
    /** Actual ISO8601 creation clock, including seconds and timezone. */
    readonly when: string;
    /** Actual originating application, such as Paint. */
    readonly creatorTool: string;
  };
  /** First-save facts. Generate independent save identities and capture the actual save clock. */
  readonly save: {
    /** Final filename without its PSD/PSB extension. */
    readonly basename: string;
    /** Actual ISO8601 save clock, including seconds and timezone. */
    readonly saveTime: string;
    /** Consistent local save wall time as YYYY:MM:DD HH:MM:SS. */
    readonly exifTime: string;
    /** Save-event UUID with the xmp.iid: prefix. */
    readonly instanceId: string;
    /** Save document UUID with the adobe:docid:photoshop: prefix. */
    readonly documentId: string;
    /** Actual saving application. Do not attribute Paint exports to Adobe. */
    readonly softwareAgent: string;
    /** Caller composite policy. PSD cannot persist Photoshop's RGBBlendGamma preference. */
    readonly linearBlending: boolean;
  };
  /** Explicit resource defaults for this document and host. */
  readonly resources: {
    /** Actual writer application name. */
    readonly writerName: string;
    /** Actual reader application name. */
    readonly readerName: string;
    /** Complete creation requires a supplied merged composite. */
    readonly mergedComposite: true;
    /** Native display-unit code, 1 or 2. */
    readonly displayUnit: 1 | 2;
    /** Unsigned 16.16 resolution and native resolution unit. */
    readonly missingResolution: readonly [number, number];
    /** Horizontal and vertical grid spacing in 1/32-pixel units. */
    readonly missingGrid: readonly [number, number];
    /** Four ARGB guide-color bytes. */
    readonly legacyGuideColor: readonly [number, number, number, number];
    /** Actual localized merged-transparency channel name. */
    readonly transparencyName: string;
    /** Whether the supplied RGB profile is tagged as sRGB. */
    readonly taggedSrgb: boolean;
  };
  /** Supported compositor and ICC state. Credential signing is outside this writer. */
  readonly document: {
    /** Truthful supported compositor settings for the document. */
    readonly compositor: {
      /** Supported compositor engine identifier. */
      readonly engine: 'compCore' | 'compCoreGPU';
      /** Host GPU policy. */
      readonly gpu: 'on' | 'off' | 'feature';
      /** Host threading policy. */
      readonly threads: 'on' | 'off' | 'feature';
      /** This bounded writer accepts the supported GPU-state marker. */
      readonly gpuSupport: 'supported';
    };
    /** Actual ICC display state. */
    readonly iccDisplay: string;
    /** Actual ICC view state. */
    readonly iccView: string;
    /** Signing credentials must remain disabled. */
    readonly newCredentialsEnabled: false;
  };
  /** Actual document RGB ICC bytes, including the caller's rendering-intent header. */
  readonly profile: Uint8Array;
  /** Stable positive unique signed-32-bit IDs in document.layers bottom-to-top order. */
  readonly layerIds: readonly number[];
  /** Finite positive layer clocks, one per layer in the same order as layerIds. */
  readonly layerTimes: readonly number[];
  /** Global lighting angle in degrees, 0 through 360. */
  readonly globalAngle: number;
  /** Global lighting altitude in degrees, 0 through 90. */
  readonly globalAltitude: number;
  /** Actual localized built-in CMYK proof-setup name. */
  readonly proofSetupName: string;
}
/**
 * Write flat RGB8 ordinary rasters and the supplied straight-RGBA composite.
 * Context initializes complete first-save XMP/history, resources and document state.
 * Omitting context keeps the identity-only legacy mode with IDs beginning at 2,
 * no XMP initialization and the largest allocated ID in resource 1044.
 * Partial alpha, clipping and transparency protection are retained. PSB is selected
 * above 30000 pixels on either side. The codec preserves caller pixels and does not render.
 * Invalid facts, unknown context keys, duplicate IDs and invalid clocks throw without
 * mutating document, context or composite. Imported files use preservation/editor saves.
 */
export function writePsd(document: unknown, composite: Uint8Array, context?: PsdNewDocumentContext): Uint8Array;



/** Host policy for a call or explicit allocation context. Defaults are 64 MiB per allocation, 512 MiB live and depth 64.
 * Limits concern accounted buffers, not OS RSS. Safe-integer byte values may raise or lower defaults.
 * retainedBytes includes caller input copies, fonts and caches not owned by this operation. */
export interface PsdBudgetOptions {
  allocationBytes?: number;
  liveBytes?: number;
  maxOffset?: number;
  maxDepth?: number;
  retainedBytes?: number;
}
/** A policy refusal, separate from corruption and Photoshop's native refusal. */
export interface PsdBudgetError extends Error {
  name: 'PsdBudgetError';
  resource: string;
  requested: bigint;
  limit: bigint;
}
/** An audited buffer allocation failed. Other legacy allocations may still abort on exhaustion. */
export interface PsdAllocationError extends Error {
  name: 'PsdAllocationError';
  requested: bigint;
}



/** Persisted source snapshot. It contains no selection, zoom, document dirty bit or linked-file OS state. */
export interface PsdSourceSnapshot {
  /** Layers in physical source order. Record indices change after structural edits. */ readonly layers: readonly PsdSourceLayer[];
  /** Resource 1060 bytes, including encoding and padding; null when absent. */ readonly xmp: Uint8Array | null;
}
/** Persisted source properties. Null means absent, never a synthesized default. */
export interface PsdSourceLayer {
  /** Lossless vector authoring models and bounded frame query, without geometry/edit admission. */ readonly vector: PsdVectorSource;
  /** Index in the selected layer-info section. */ readonly recordIndex: number;
  /** Stored lyid, null if absent. */ readonly layerId: number | null;
  /** Raw lspf bits plus their named stored flags, null without lspf. */ readonly locks: SourceLocks | null;
  /** Stored lclr index and Photoshop 26 enum name, null without lclr. */ readonly label: SourceLabel | null;
  /** Winning modern source block, null without modern styles. Legacy lrFX stays separate. */ readonly styles: SourceStyles | null;
  /** First legacy lrFX storage block; no rendering or edit admission follows from typing. */ readonly legacyStyles: LegacyStyleSource | null;
  /** Persisted shmd envelope, null without the block. Payloads are retained as bytes. */ readonly metadata: SourceMetadata | null;
}
/** Stored lock flags. Background runtime defaults are not inserted. */
export interface SourceLocks {
  /** All 32 bits, including reserved bits. */ readonly bits: number;
  /** Bit 0. */ readonly transparency: boolean;
  /** Bit 1. */ readonly composite: boolean;
  /** Bit 2. */ readonly position: boolean;
  /** Bit 3. */ readonly artboardAutonest: boolean;
  /** Bit 31. */ readonly all: boolean;
}
/** Persisted layer color label. */
export interface SourceLabel {
  /** Raw unsigned label index. */ readonly index: number;
  /** Photoshop 26 AM name, null for an unknown index. */ readonly name: string | null;
}
/** Lossless shmd records and tail. */
export interface SourceMetadata {
  /** Source order, including duplicate keys. */ readonly records: readonly SourceMetadataEntry[];
  /** Bytes following the declared record count. */ readonly trailing: Uint8Array;
}
/** A shmd record; opaque payloads do not imply typed AM metadata coverage. */
export interface SourceMetadataEntry {
  /** Four source signature bytes. */ readonly signature: Uint8Array;
  /** Four metadata-key bytes. */ readonly key: Uint8Array;
  /** Raw copy-on-sheet byte. */ readonly copyOnSheet: number;
  /** Three reserved bytes. */ readonly reserved: Uint8Array;
  /** Original payload and its padding. */ readonly payload: Uint8Array;
}
/** Stored SourceStyles snapshot; fields retain source precision and absence. */
export interface SourceStyles {
  /** Winning block key. */ readonly key: Uint8Array;
  /** Stored effects version. */ readonly version: number;
  /** Stored master switch; missing imports as true in the rendering projection. */ readonly masterFxSwitch: boolean | null;
  /** Stored style scale, with its unit and binary64 value. */ readonly scale: SourceNumber | null;
  /** Known families in physical source order, including disabled/UI-only instances. */ readonly instances: readonly (SourceInstance)[];
  /** Original block bytes, including unknown entries and padding. */ readonly sourceBlock: Uint8Array;
}
/** Stored SourceInstance snapshot; fields retain source precision and absence. */
export interface SourceInstance {
  /** Family's source key, retaining the single versus Multi distinction. */ readonly key: Uint8Array;
  /** Position in the family's source list, zero for a singleton. */ readonly index: number;
  /** Stored settings, independent from renderer defaults and projections. */ readonly settings: SourceSettings;
}
/** Stored SourceSettings snapshot; fields retain source precision and absence. */
export interface SourceSettings {
  /** Stored `enab`; absent or differently tagged leaves remain None. */ readonly enabled: boolean | null;
  /** Stored `present`; absent or differently tagged leaves remain None. */ readonly present: boolean | null;
  /** Stored `showInDialog`; absent or differently tagged leaves remain None. */ readonly showInDialog: boolean | null;
  /** Stored `AntA`; absent or differently tagged leaves remain None. */ readonly antiAlias: boolean | null;
  /** Stored `uglg`; absent or differently tagged leaves remain None. */ readonly useGlobalAngle: boolean | null;
  /** Stored `layerConceals`; absent or differently tagged leaves remain None. */ readonly layerConceals: boolean | null;
  /** Stored `Invr`; absent or differently tagged leaves remain None. */ readonly invert: boolean | null;
  /** Stored `overprint`; absent or differently tagged leaves remain None. */ readonly overprint: boolean | null;
  /** Stored `useShape`; absent or differently tagged leaves remain None. */ readonly useShape: boolean | null;
  /** Stored `useTexture`; absent or differently tagged leaves remain None. */ readonly useTexture: boolean | null;
  /** Stored `antialiasGloss`; absent or differently tagged leaves remain None. */ readonly antialiasGloss: boolean | null;
  /** Stored `InvT`; absent or differently tagged leaves remain None. */ readonly invertTexture: boolean | null;
  /** Stored `Algn`; absent or differently tagged leaves remain None. */ readonly align: boolean | null;
  /** Stored `Rvrs`; absent or differently tagged leaves remain None. */ readonly reverse: boolean | null;
  /** Stored `Dthr`; absent or differently tagged leaves remain None. */ readonly dither: boolean | null;
  /** Stored `Lnkd`; absent or differently tagged leaves remain None. */ readonly linked: boolean | null;
  /** Stored `Opct`; absent or differently tagged leaves remain None. */ readonly opacity: SourceNumber | null;
  /** Stored `hglO`; absent or differently tagged leaves remain None. */ readonly highlightOpacity: SourceNumber | null;
  /** Stored `sdwO`; absent or differently tagged leaves remain None. */ readonly shadowOpacity: SourceNumber | null;
  /** Stored `Dstn`; absent or differently tagged leaves remain None. */ readonly distance: SourceNumber | null;
  /** Stored `blur`; absent or differently tagged leaves remain None. */ readonly blur: SourceNumber | null;
  /** Stored `Ckmt`; absent or differently tagged leaves remain None. */ readonly choke: SourceNumber | null;
  /** Stored `Nose`; absent or differently tagged leaves remain None. */ readonly noise: SourceNumber | null;
  /** Stored `Angl`; absent or differently tagged leaves remain None. */ readonly angle: SourceNumber | null;
  /** Stored `lagl`; absent or differently tagged leaves remain None. */ readonly localLightingAngle: SourceNumber | null;
  /** Stored `Lald`; absent or differently tagged leaves remain None. */ readonly localLightingAltitude: SourceNumber | null;
  /** Stored `ShdN`; absent or differently tagged leaves remain None. */ readonly shadingNoise: SourceNumber | null;
  /** Stored `Inpr`; absent or differently tagged leaves remain None. */ readonly inputRange: SourceNumber | null;
  /** Stored `Sz  `; absent or differently tagged leaves remain None. */ readonly size: SourceNumber | null;
  /** Stored `srgR`; absent or differently tagged leaves remain None. */ readonly strength: SourceNumber | null;
  /** Stored `Sftn`; absent or differently tagged leaves remain None. */ readonly softness: SourceNumber | null;
  /** Stored `textureDepth`; absent or differently tagged leaves remain None. */ readonly textureDepth: SourceNumber | null;
  /** Stored `Scl `; absent or differently tagged leaves remain None. */ readonly scale: SourceNumber | null;
  /** Stored `Md  `; absent or differently tagged leaves remain None. */ readonly mode: SourceEnum | null;
  /** Stored `hglM`; absent or differently tagged leaves remain None. */ readonly highlightMode: SourceEnum | null;
  /** Stored `sdwM`; absent or differently tagged leaves remain None. */ readonly shadowMode: SourceEnum | null;
  /** Stored `bvlS`; absent or differently tagged leaves remain None. */ readonly bevelStyle: SourceEnum | null;
  /** Stored `bvlT`; absent or differently tagged leaves remain None. */ readonly bevelTechnique: SourceEnum | null;
  /** Stored `bvlD`; absent or differently tagged leaves remain None. */ readonly bevelDirection: SourceEnum | null;
  /** Stored `GlwT`; absent or differently tagged leaves remain None. */ readonly glowTechnique: SourceEnum | null;
  /** Stored `glwS`; absent or differently tagged leaves remain None. */ readonly innerGlowSource: SourceEnum | null;
  /** Stored `Styl`; absent or differently tagged leaves remain None. */ readonly style: SourceEnum | null;
  /** Stored `PntT`; absent or differently tagged leaves remain None. */ readonly paintType: SourceEnum | null;
  /** Stored `Type`; absent or differently tagged leaves remain None. */ readonly gradientType: SourceEnum | null;
  /** Stored `gradientsInterpolationMethod`; absent or differently tagged leaves remain None. */ readonly interpolation: SourceEnum | null;
  /** Stored `gs99`, the Gradient Overlay interpolation selector; absence stays distinct from the stroke/glow key. */ readonly gradientInterpolation: SourceEnum | null;
  /** Stored `Clr `; absent or differently tagged leaves remain None. */ readonly color: SourceColor | null;
  /** Stored `hglC`; absent or differently tagged leaves remain None. */ readonly highlightColor: SourceColor | null;
  /** Stored `sdwC`; absent or differently tagged leaves remain None. */ readonly shadowColor: SourceColor | null;
  /** Stored `TrnS`; absent or differently tagged leaves remain None. */ readonly transferSpec: SourceContour | null;
  /** Stored `MpgS`; absent or differently tagged leaves remain None. */ readonly mappingShape: SourceContour | null;
  /** Stored `TrnS`; absent or differently tagged leaves remain None. */ readonly transparencyShape: SourceContour | null;
  /** Stored `Grad`; absent or differently tagged leaves remain None. */ readonly gradient: SourceGradient | null;
  /** Stored `Ptrn`; absent or differently tagged leaves remain None. */ readonly pattern: SourcePattern | null;
  /** Stored `phase`; absent or differently tagged leaves remain None. */ readonly phase: SourcePoint | null;
  /** Stored `Ofst`; absent or differently tagged leaves remain None. */ readonly offset: SourcePoint | null;
}
/** Stored SourceNumber snapshot; fields retain source precision and absence. */
export interface SourceNumber {
  /** Exact binary64 value, without color scaling, percent conversion or byte rounding. */ readonly value: number;
  /** Unit FourCC, None for an untagged numeric value. */ readonly unit: readonly (number)[] | null;
  /** True only for the original signed-integer value tag. */ readonly integer: boolean;
}
/** Stored SourceEnum snapshot; fields retain source precision and absence. */
export interface SourceEnum {
  /** Original domain and selected identifier. */ readonly value: SourceEnumValue;
}
/** Stored SourceColor snapshot; fields retain source precision and absence. */
export interface SourceColor {
  /** Descriptor color class, such as RGBC, CMYC, LbCl, Grsc or RGBT. */ readonly class: readonly (number)[];
  /** Red, green and blue in source RGB component units. */ readonly rgb: readonly (SourceNumber | null)[];
  /** Float RGB components, stored separately from ordinary RGB components. */ readonly rgbFloat: readonly (SourceNumber | null)[];
  /** Cyan, magenta, yellow and black source percentages. */ readonly cmyk: readonly (SourceNumber | null)[];
  /** Lab lightness, a and b. */ readonly lab: readonly (SourceNumber | null)[];
  /** Gray source component. */ readonly gray: SourceNumber | null;
  /** Hue, saturation and brightness source components. */ readonly hsb: readonly (SourceNumber | null)[];
}
/** Stored SourcePoint snapshot; fields retain source precision and absence. */
export interface SourcePoint {
  /** Horizontal source coordinate. */ readonly horizontal: SourceNumber | null;
  /** Vertical source coordinate. */ readonly vertical: SourceNumber | null;
}
/** Stored SourceContour snapshot; fields retain source precision and absence. */
export interface SourceContour {
  /** Raw UTF16 contour name, including any terminator. */ readonly name: Uint16Array | null;
  /** Ordered points, None if the list is absent or differently tagged. */ readonly points: readonly (SourceContourPoint)[] | null;
}
/** Stored SourceContourPoint snapshot; fields retain source precision and absence. */
export interface SourceContourPoint {
  /** Exact source coordinates. */ readonly point: SourcePoint;
  /** Optional continuity flag. Absence is distinct from false. */ readonly continuity: boolean | null;
}
/** Stored SourceGradient snapshot; fields retain source precision and absence. */
export interface SourceGradient {
  /** Raw UTF16 name, including any terminator. */ readonly name: Uint16Array | null;
  /** Stored gradient form, including noise gradients. */ readonly form: SourceEnum | null;
  /** Stored interpolation smoothness. */ readonly smoothness: SourceNumber | null;
  /** Source color stops; None without the list. */ readonly colors: readonly (SourceColorStop)[] | null;
  /** Source transparency stops; None without the list. */ readonly transparency: readonly (SourceOpacityStop)[] | null;
}
/** Stored SourceColorStop snapshot; fields retain source precision and absence. */
export interface SourceColorStop {
  /** Stored position, conventionally 0..4096. */ readonly location: SourceNumber | null;
  /** Stored midpoint percentage. */ readonly midpoint: SourceNumber | null;
  /** Stored color without conversion. */ readonly color: SourceColor | null;
  /** User/foreground/background color-stop type. */ readonly kind: SourceEnum | null;
}
/** Stored SourceOpacityStop snapshot; fields retain source precision and absence. */
export interface SourceOpacityStop {
  /** Stored position. */ readonly location: SourceNumber | null;
  /** Stored midpoint. */ readonly midpoint: SourceNumber | null;
  /** Exact stored opacity percentage. */ readonly opacity: SourceNumber | null;
}
/** Stored SourcePattern snapshot; fields retain source precision and absence. */
export interface SourcePattern {
  /** Raw UTF16 display name, including any terminator. */ readonly name: Uint16Array | null;
  /** Raw UTF16 pattern identifier, including any terminator. */ readonly id: Uint16Array | null;
}
/** Exact enum identifiers as text; the original FourCC/string envelope remains in sourceBlock. */
export interface SourceEnumValue {
  /** Enum domain. */ readonly type: string;
  /** Selected identifier, including unknown values. */ readonly value: string;
}
/** Ordered lossless lrFX storage, independent of modern effects and render admission. */
export interface LegacyStyleSource {
  readonly version: number;
  readonly records: readonly LegacyRecord[];
  readonly tail: Uint8Array;
  readonly sourceBlock: Uint8Array;
}
export interface LegacyRecord {
  readonly signature: Uint8Array;
  readonly key: Uint8Array;
  readonly body: Uint8Array;
  readonly tail: Uint8Array;
  readonly settings: LegacySettings;
}
export type LegacySettings =
  | (LegacyCommon & { readonly kind: 'common' })
  | (LegacyShadow & { readonly kind: 'shadow' })
  | (LegacyGlow & { readonly kind: 'glow' })
  | (LegacyBevel & { readonly kind: 'bevel' })
  | (LegacyOverlay & { readonly kind: 'overlay' })
  | { readonly kind: 'opaque' };
export interface LegacyCommon {
 /** Stored version, without normalization. */ readonly version: number;
 /** Stored common visibility byte; Photoshop26 reads and discards it. */ readonly visible: number;
 /** Reserved bytes preserved exactly. */ readonly reserved: readonly number[];
}
export interface LegacyShadow {
 /** Stored record version. */ readonly version: number;
 /** Unsigned 16.16 blur. */ readonly blur: number;
 /** Unsigned 16.16 intensity; runtime may convert it to a contour. */ readonly intensity: number;
 /** Signed 16.16 local angle. */ readonly angle: number;
 /** Unsigned 16.16 distance. */ readonly distance: number;
 /** Imported legacy color. */ readonly color: LegacyColor;
 /** Stored blend signature and key. */ readonly mode: LegacyMode;
 /** Stored enable byte. */ readonly enabled: number;
 /** Stored global-light byte. */ readonly useGlobalAngle: number;
 /** Stored opacity byte. */ readonly opacity: number;
 /** Optional compatibility color tail; ignored by the PS26 importer. */ readonly nativeColor: LegacyColor | null;
}
export interface LegacyGlow {
 /** Stored record version. */ readonly version: number;
 /** Unsigned 16.16 blur. */ readonly blur: number;
 /** Unsigned 16.16 intensity. */ readonly intensity: number;
 /** Imported color. */ readonly color: LegacyColor;
 /** Stored blend signature and key. */ readonly mode: LegacyMode;
 /** Stored enable byte. */ readonly enabled: number;
 /** Stored opacity byte. */ readonly opacity: number;
 /** Inner Glow source byte, present for versions above zero in PS26. */ readonly invert: number | null;
 /** Optional ignored compatibility color tail. */ readonly nativeColor: LegacyColor | null;
}
export interface LegacyBevel {
 /** Stored record version. */ readonly version: number;
 /** Signed 16.16 angle. */ readonly angle: number;
 /** Unsigned 16.16 legacy strength, before runtime division by blur. */ readonly strength: number;
 /** Unsigned 16.16 blur, before style-dependent runtime doubling. */ readonly blur: number;
 /** Stored highlight blend mode. */ readonly highlightMode: LegacyMode;
 /** Stored shadow blend mode. */ readonly shadowMode: LegacyMode;
 /** Imported highlight color. */ readonly highlightColor: LegacyColor;
 /** Imported shadow color. */ readonly shadowColor: LegacyColor;
 /** Stored style index. */ readonly style: number;
 /** Stored highlight opacity byte. */ readonly highlightOpacity: number;
 /** Stored shadow opacity byte. */ readonly shadowOpacity: number;
 /** Stored enable byte. */ readonly enabled: number;
 /** Stored global-light byte. */ readonly useGlobalAngle: number;
 /** Stored direction byte. */ readonly direction: number;
 /** Optional ignored native highlight tail. */ readonly nativeHighlight: LegacyColor | null;
 /** Optional ignored native shadow tail. */ readonly nativeShadow: LegacyColor | null;
}
export interface LegacyOverlay {
 /** Stored version; PS26 reads and discards it. */ readonly version: number;
 /** Stored blend signature and key. */ readonly mode: LegacyMode;
 /** Color used by PS26, independent of the native tail. */ readonly color: LegacyColor;
 /** Stored opacity byte. */ readonly opacity: number;
 /** Stored enable byte. */ readonly enabled: number;
 /** Optional ignored native-color tail. */ readonly nativeColor: LegacyColor | null;
}
export interface LegacyColor {
 /** Stored color-space identifier, without conversion. */ readonly space: number;
 /** Four raw component words, including reserved components. */ readonly components: readonly number[];
}
export interface LegacyMode {
 /** Stored signature; no substitution is performed. */ readonly signature: Uint8Array;
 /** Stored FourCC blend key. */ readonly key: Uint8Array;
}



/** Physical source-backed primary layer metadata. Stream offsets never narrow to WASM pointers. */
export interface PsdSourceLayer extends PsdNativeRect {
  index: number; name: string;
  channels: Array<{ id: number; offset: bigint; length: bigint }>;
}



/** A nonempty rectangle in document pixels, used by renderRegions. */
export interface PsdRegionRect {
    /** Left document coordinate. */
    left: number;
    /** Top document coordinate. */
    top: number;
    /** Positive integer width. */
    width: number;
    /** Positive integer height. */
    height: number;
}
/** Display pixels returned by the region and overview APIs. */
export interface PsdRegionPixels {
    /** Document x origin for a region, zero for an overview. */
    left: number;
    /** Document y origin for a region, zero for an overview. */
    top: number;
    /** Output width in pixels. */
    width: number;
    /** Output height in pixels. */
    height: number;
    /** Straight 8-bit RGBA. Its buffer may be transferred to a worker. */
    pixels: Uint8Array;
    /** Integer document-pixel sampling stride. */
    step: number;
    /** Allocation strategy; fullCanvas is a conservative spatial fallback. */
    strategy: 'window' | 'fullCanvas' | 'streamed';
    /** Fresh layer compositing or the file's potentially stale merged image. */
    source: 'layers' | 'savedComposite';
    /** True means exact decimation/cropping of the layer render, with approximations below. */
    exactToLayerRender: boolean;
    /** Existing compositor approximations, independent of crop/decimation exactness. */
    approximations: string[];
}



/** Confirmed imported queries. Source bytes remain the writing authority. */
export interface PsdMetadataQueries {
  /** Ordered persisted comps, null on refusal. Panel selection is not inferred. */
  readonly compsList: readonly PsdImportedCompQuery[] | null;
  /** Signed angle, default 30 when absent, null on refusal. */
  readonly globalAngle: number | null;
  /** Binary64 aspect ratio, default 1 when absent, null on refusal. Implausible-ratio correction is unresolved. */
  readonly pixelScaleFactor: number | null;
  /** Bounded XMP leaves; absent fields receive no empty defaults. Null on carrier refusal. */
  readonly fileInfo: PsdImportedFileInfo | null;
  /** Carrier or fileInfo/field reasons. Refused source bytes are retained. */
  readonly refusals: Readonly<Record<string, string>>;
}
/** Persisted comp in source order, independent from the comp panel's selection. */
export interface PsdImportedCompQuery {
  /** Persistent source comp identity. */ readonly ID: number;
  /** One-based position in resource 1065. */ readonly itemIndex: number;
  /** Imported name. */ readonly title: string;
  /** Omitted when the source has no comment. */ readonly comment?: string;
  /** capturedInfo bit 1. */ readonly useVisibility: boolean;
  /** capturedInfo bit 2. */ readonly usePosition: boolean;
  /** capturedInfo bit 4. */ readonly useAppearance: boolean;
  /** capturedInfo bit 8. */ readonly useChildLayerCompState: boolean;
}
/** Read-only J-metadata leaves. General XMP/IPTC editing and copyright reconciliation remain unresolved. */
export interface PsdImportedFileInfo {
  /** Photoshop AuthorsPosition. */ readonly bylineTitle?: string;
  /** Photoshop CaptionWriter. */ readonly captionWriter?: string;
  /** Photoshop City. */ readonly city?: string;
  /** Photoshop Country. */ readonly countryName?: string;
  /** Photoshop Credit. */ readonly credit?: string;
  /** dc:subject Bag order, preserving duplicate entries. */ readonly keywords?: readonly string[];
  /** Sole dc:title x-default. */ readonly objectName?: string;
  /** Photoshop State. */ readonly provinceState?: string;
}


/**
 * An open document: its parsed container and each layer record's saved visibility.
 */
export class PsdDocumentHandle {
  private constructor();
  free(): void;
  /**
   * Compares a render to the saved snapshot. A mismatch can reflect authoring-state differences; this is not
   * a Photoshop 26 next-open oracle. Equality applies only to these pixels and does not authorize an edit.
   * Compares `image`, a render of this document, with Photoshop's merged image as Photoshop stores it: our color
   * matted against white where the merged image has an alpha plane, 8-bit documents in levels, 16-bit ones in wire
   * levels and 32-bit ones in float32 units in the last place. CMYK and Lab composites made in their channels
   * compare channel by channel at the document's depth (`CMYK level`, `16-bit Lab level`, …), approximate renders of
   * other color modes in sRGB levels against the merged image converted the same way, and approximate renders of
   * 16- and 32-bit documents made at 8 bits in `8-bit level`s against the merged image reduced the same way.
   * Returns the counts, the largest difference, a histogram of absolute differences and a heat map (`pixels`):
   * matching pixels as a dimmed gray of our render, differing ones from yellow (one level) through red to magenta
   * (largest) on a logarithmic scale.
   */
  difference(image: RenderedImage): any;
  /**
   * Lists saved and work paths after companion overrides, with original Q24 knots and pixel geometry.
   * Malformed paths remain listed with typed per-path errors; duplicate identities refuse the query.
   */
  savedPaths(options: PsdBudgetOptions | null | undefined): PsdSavedPath[];
  /**
   * Everything known about layer record `index`: properties, mask, vector mask, effects with their settings,
   * adjustment settings, text, smart-object placement and contents, and the raw tagged blocks. The properties'
   * opacity, Fill and `transparencyShapesLayer` are those Photoshop 26 imports, with `legacyOpacity` as in
   * [`Self::layers`].
   */
  layerDetail(index: number): any;
  /**
   * The layer's own color and transparency as straight 8-bit RGBA (`left`, `top`, `width`, `height`, `pixels`),
   * converted from the document's depth with the crate's verified conversions, without masks or effects, and its
   * mask channels (`masks`: user mask `-2` and real raster mask `-3`) as 8-bit planes with their rectangles.
   */
  layerPixels(index: number): any;
  /**
   * Reads original layer color/transparency/mask channels, each clipped to its own bounds.
   * IDs -2/-3 select masks. Samples keep native wire depth; density/feather are not applied.
   * Missing channels refuse. Options use PsdBudgetOptions and account for JS output copies.
   */
  layerRegion(index: number, rect: PsdNativeRect, ids: Int16Array, options: PsdBudgetOptions | null | undefined): PsdNativeRegion;
  /**
   * Composite exact process channels and convert them separately to configured sRGB.
   * `options` has render's blend/text gamma, fonts, state and visibility contract, with approximate=false.
   * `color` requires caller-owned `srgb: Uint8Array`; optional `workingRgb`, `workingGray`, `workingCmyk`
   * supply untagged sources. The caller attests srgb bytes describe sRGB; unknown RGB serializations are approximate.
   * No installed profiles are read. Defaults: engine="ace", intent="relative", blackPointCompensation=true,
   * dither=false, preciseFloat=true, importPolicy="preserve", pixelAspectCorrection=false. Unknown color keys fail.
   * importPolicy records an already applied import, never changes process samples or repeats conversion.
   * OCIO document kinds and color.ocio=true dispatch before ICC and refuse without an external processor.
   * proof, sceneReferred and hdrPreview default false and refuse when true. This API defines sRGB output,
   * not live monitor presentation. Returns process and srgb typed samples, rgba8, conversion provenance,
   * DisplayConversion approximations and continuous displayWidth/displayHeight. Word samples use PSD wire16;
   * alpha is separate from color in each interleaved pixel. Float display and dither remain reported approximations.
   * Bitmap bits and Indexed indices/palette remain native in process; only the display operand expands.
   * Ink modes and auxiliary plates remain available unchanged through savedProcessChannels.
   */
  renderColor(options: any, color: any, fonts: PsdFontLibrary): any;
  /**
   * Reads selected saved process/alpha/spot planes in a bounded rectangle at native depth.
   * Saved pixels retain their matte and can be stale. Throws typed budget/corruption errors.
   * Options use PsdBudgetOptions; caller retainedBytes covers fonts and external caches.
   */
  savedRegion(rect: PsdNativeRect, indices: Uint16Array, options: PsdBudgetOptions | null | undefined): PsdNativeRegion;
  /**
   * Reports supplied release mismatches separately from unavailable raster fonts, including uniquely
   * supplied addActiveFace collection faces. Equal versions cannot
   * prove identical charstrings because PSD does not embed those font programs.
   * Whether type layer record `index` re-renders from its text with `fonts` as the compositor would with
   * `typeLayers` (`supported`, else the crate's `reason`), with the fonts it uses (`fonts`) and those `fonts` lacks
   * (`missing`); `null` for other records. 8-bit documents are checked with `render_rgba8`, 16- and 32-bit RGB and
   * Grayscale ones with `render_saved`; the compositor can still refuse the layer's blending at those depths. The
   * layer is re-rendered once to decide, which takes as long as compositing it.
   */
  textSupport(index: number, fonts: PsdFontLibrary): any;
  /**
   * Renders a rectangle in document pixels as a `PsdRegionPixels` object. `left`, `top`,
   * `width`, `height` must describe a nonempty rectangle inside the canvas. `options` and
   * `fonts` have `render`'s meaning, with optional positive integer `maxWorkPixels`, default
   * 16,777,216. Spatial dependencies may require a full-canvas fallback, reported by
   * `strategy`; a dependency exceeding the limit throws `PsdUnsupportedError` before rendering.
   * Pixels equal the corresponding whole render, including its reported approximations.
   * The returned `Uint8Array` owns its storage and can be transferred to another worker.
   * `options.budget` overrides 64 MiB per allocation/512 MiB live admission per call, using
   * allocationBytes/liveBytes/retainedBytes. Retained bytes include external fonts/caches.
   * Conservative accounting can require a larger liveBytes value for a many-layer document.
   */
  renderRegion(left: number, top: number, width: number, height: number, options: any, fonts: PsdFontLibrary): PsdRegionPixels;
  /**
   * The fonts the document's type layers use, by the PostScript names their style runs select from the layer's
   * `FontSet` (unused `FontSet` defaults such as `AdobeInvisFont` are left out), sorted by name, each with whether
   * `fonts` holds it and the record indices of the type layers using it (`fonts`), and per type layer record, bottom
   * to top, its name, visibility as saved and fonts, or `error` when its text cannot be read (`layers`).
   */
  documentFonts(fonts: PsdFontLibrary): any;
  /**
   * Renders 1 to 256 rectangles from one state/visibility/font snapshot. Each rectangle is
   * `{ left, top, width, height }` in integer document pixels. Their total output area and
   * every spatial dependency must fit `maxWorkPixels`. Full-canvas fallbacks are computed
   * once for the batch and freed before return; each result has `renderRegion`'s contract.
   * A failure returns no partial batch and restores the document's visibility.
   */
  renderRegions(rectangles: PsdRegionRect[], options: any, fonts: PsdFontLibrary): PsdRegionPixels[];
  /**
   * Decimates the file's saved merged image with bounded row scratch. Returns `PsdRegionPixels`
   * with `source: 'savedComposite'` and `exactToLayerRender: false`. This preview can be stale
   * and may differ from Photoshop-26 recompositing. It ignores visibility/state edits and must
   * be discarded after edits. Refuses an image marked as not real. `maxWorkPixels` limits
   * output pixels, default 16,777,216 when zero. `step` must be positive.
   * Optional third argument overrides 64 MiB allocation/512 MiB live budgets per call with
   * allocationBytes/liveBytes/retainedBytes; container storage is counted automatically.
   */
  savedOverview(step: number, max_work_pixels: number, budget_options?: object | null): PsdRegionPixels;
  /**
   * Exact integer decimation of a fresh layer render. Output pixel `(x,y)` samples document
   * pixel `(x*step,y*step)`, without filtering or scaling operation parameters. Dimensions are
   * `ceil(documentWidth/step)` by `ceil(documentHeight/step)`. `step` must be positive.
   * Returns `PsdRegionPixels`; options, visibility, state and fonts match `renderRegion`.
   * Rendering sampled scanlines bounds canvas storage but may be slower than a whole render.
   */
  renderOverview(step: number, options: any, fonts: PsdFontLibrary): PsdRegionPixels;
  /**
   * Parses with explicit host budgets before copying payloads. Defaults are 64 MiB per
   * allocation and 512 MiB live, depth 64, u64 offsets through i64::MAX. Options are
   * allocationBytes/liveBytes/maxOffset/maxDepth/retainedBytes. Retained bytes must include
   * external caches; the binding additionally accounts for its input and the host input copy.
   * Input length is checked before copying the host Uint8Array into WASM.
   * Use per-call overrides when a compressed payload exceeds the default; region output stays windowed.
   */
  static openWithBudget(bytes: Uint8Array, options: any): PsdDocumentHandle;
  /**
   * Plans rectangle storage using render's state, visibility, font and target settings.
   * Reports typed full-canvas dependencies and byte/work-limit refusals without allocating pixels.
   * Semantic strict-render support is checked when rendering, separately from this storage plan.
   */
  regionCapability(rect: PsdNativeRect, options: PsdNativeRenderOptions | null | undefined, fonts: PsdFontLibrary): PsdRegionCapability;
  /**
   * Full rendering with explicit per-call host admission. Defaults are 64 MiB per
   * allocation and 512 MiB live; retainedBytes includes caller fonts and caches.
   * Preflights the selected state, visibility, generated sources and referenced patterns before rendering.
   */
  renderWithBudget(options: any, fonts: PsdFontLibrary, budget_options: any): RenderedImage;
  /**
   * Opens a PSD or PSB as Photoshop 26 does, keeping the strict reading of [`Self::open`] where it is Photoshop's
   * document or Photoshop refuses a file the strict reader reads (see the `opening` module). `answers` holds the
   * answers to Photoshop's prompts: `corruptLayers` (`ok`, `flatten` or `cancel`) and `layerDataProblem`
   * (`readComposite` or `cancel`), each absent until the prompt was shown. Returns one of
   *
   * - `{ outcome: 'opened', document, opening }`: `document` is a handle like [`Self::open`]'s; `opening` says
   *   whether the document is Photoshop's interpretation (`reader`: `strict` or `photoshop`), the prompts and alerts
   *   Photoshop shows with their answers (`alerts`: `kind`, `message`, `answer` as the button's label), what the
   *   interpretation changed from the strict reading (`repairs`, in words), why the strict reader failed
   *   (`strictError`) and Photoshop's refusal of a file the strict reader reads (`photoshopRefuses`);
   * - `{ outcome: 'refused', message }`: Photoshop does not open the file (and the strict reader cannot), or a prompt
   *   was answered Cancel; the message names Photoshop's behavior;
   * - `{ outcome: 'needsAnswer', prompt }`: Photoshop asks before opening and `answers` holds no answer:
   *   `prompt` has its `id` (the answers' key), its verbatim `message` and its `buttons` (`answer`, `label`,
   *   `default` for Photoshop's default button), in Photoshop's order.
   *
   * Throws a `TypeError` for answers that are not one of their prompt's.
   */
  static openLikePhotoshop(bytes: Uint8Array, answers: any): any;
  /**
   * Renders a rectangle before display reduction, preserving RGB16 or CMYK/Lab internal units
   * and RGB32 float bits. Uses the same settings as renderRegion, with typed storage refusals.
   * Returned samples own their storage. Full-canvas dependencies remain explicit in strategy.
   */
  renderNativeRegion(rect: PsdNativeRect, options: PsdNativeRenderOptions | null | undefined, fonts: PsdFontLibrary): PsdNativeRender;
  /**
   * Exact decoded saved process planes, including auxiliary alpha/spot planes as separate byte arrays.
   * Native byte order, packed Bitmap rows, Indexed palette, ink data and float bit patterns are preserved.
   * The source is the potentially stale saved merged image with its original matte, not a fresh layer render.
   * Resources preserve plate names, display metadata, profiles and untagged state without guessing.
   * Optional visibility supplies one boolean per saved plane; omitted view visibility is returned as null.
   */
  savedProcessChannels(visibility?: Array<any> | null): any;
  /**
   * Recovery opening with explicit per-call budgets and typed PsdBudgetError failures.
   * Defaults are 64 MiB per allocation, 512 MiB live and nesting depth 64. Caller retainedBytes
   * covers external storage; both reader models and both input copies are additionally counted.
   */
  static openLikePhotoshopWithBudget(bytes: Uint8Array, answers: any, options: any): any;
  /**
   * Size, depth, color mode, channels, format, image resources, document-level tagged blocks and the merged
   * image's layout.
   */
  info(): any;
  /**
   * Parses a PSD or PSB file. Fails only when the header or an outer section is unusable; damaged inner
   * structures stay readable as far as they parse.
   */
  static open(bytes: Uint8Array): PsdDocumentHandle;
  /**
   * The layer tree, bottom to top as stored: groups hold their children, also bottom to top. Each node carries
   * the summary a layers panel shows and `notes` on what the compositor leaves out or approximates. Its `opacity`,
   * `fill` and `transparencyShapesLayer` are those Photoshop 26 imports, which its Layers panel shows and the
   * compositor uses; `legacyOpacity` is `{ storedOpacity, inferredVersion }` for a legacy record whose stored opacity
   * it imports as Fill ([`legacy_opacity`]), `null` otherwise. Fails when group markers do not nest.
   */
  layers(): any;
  /**
   * Displays the saved snapshot without reconstructing layers or validating historical text state. It may
   * differ from `render()` and Photoshop 26 next-open composition. Decoding does not certify an editable state.
   * Photoshop's saved merged image ("Maximize Compatibility") as straight 8-bit RGBA, unmatted from white where it
   * carries transparency and converted from 16 and 32 bits like the composite. Throws `PsdUnsupportedError` when
   * the file has none or its color mode is not rendered.
   */
  merged(): any;
  /**
   * Reconstructs layers for the Photoshop 26 target with caller-supplied settings. Historical authoring state
   * is not reconstructed, and a successful render can differ from the saved snapshot even when Photoshop 26
   * wrote it. Use `merged()` for saved pixels. Empty approximations describe this render policy only.
   * Composites the document with `options` (see [`RenderSettings::read`]): 8-bit RGB and Grayscale with
   * `composite_with_report`, 16- and 32-bit with `composite_deep`, CMYK and Lab of 8 and 16 bits in their own
   * channels with `composite_channels` whether or not `approximate` is set (shown through the approximate
   * conversion to sRGB, which the render's `approximations` report), Bitmap from its flattened image. With
   * `approximate`, what those refuse renders through `composite_with_report` instead: RGB and Grayscale documents
   * leniently, 16- and 32-bit ones at their depth where only modeled adjustment kernels are refused and otherwise at
   * 8 bits, the other color modes and the CMYK and Lab documents
   * `composite_channels` rejects with their layers converted to sRGB, each approximation listed in the render's
   * `approximations`. With `typeLayers`, type layers are re-rendered from their text with the fonts of `fonts`
   * (`CompositeOptions::type_layers`): a type layer the crate does not re-render exactly, or whose font `fonts` lacks,
   * fails the render, or with `approximate` composites its cached raster and is listed. Separately,
   * `fonts` supplies active-face data for imported-layout diagnostics and bounded cached-mixer selection
   * even with `typeLayers: false`. Pass known active PostScript names as `availableFonts` for missing-font
   * decisions; omit an unknown inventory. This option is used only when active face bytes are supplied.
   * The host must add original active TrueType bytes with their actual TTC indices using `addActiveFace`, or
   * standalone active fonts using `add`. No system inventory is read. An empty library preserves existing
   * cached rendering and abstains from font-dependent witnesses. A partial library checks uniquely supplied
   * faces without treating absent names as missing fonts; it never certifies every imported layout as valid.
   * A supplied-font glyph conflict with the bounded direct-Latin certificate admits the ordinary cached
   * return without a diagnostic, unless `typeLayers` requests regeneration. Other conflicts throw in strict
   * mode. In `approximate`, supported global-style cmap or coherent descender conflicts select ordinary
   * document mixing and retain the cached raster and CachedRaster diagnostic.
   * Other imports stay unresolved and keep their existing mixing and reporting.
   * `grayProfile` optionally supplies caller-owned working-Gray ICC bytes as a `Uint8Array`.
   * Modern transparent rectangle gradients require the admitted Dot Gain 20% profile explicitly;
   * omitting it preserves their existing refusal/cache policy. No installed profile is read.
   * Visibility overrides apply to this render only. Throws `PsdUnsupportedError` naming the
   * first setting the compositor does not reproduce.
   */
  render(options: any, fonts: PsdFontLibrary): RenderedImage;
  /**
   * The document's saved alternate states, which `render`'s `state` selects: `comps`, its layer comps in panel
   * order (`id`, `name`, `comment` when it has one); `lastAppliedComp`, the ID of the comp last applied, which the
   * saved layers need not match, or `null`; `frames`, the frames of the active frame set in playback order (`id`,
   * `delay` in hundredths of a second); `activeFrame`, the ID of the saved active frame, whose selection leaves the
   * document as saved, or `null`. Lists are empty without comps or a frame animation; a resource that does not
   * parse counts as absent and is named in `errors`.
   */
  states(): any;
}
/**
 * Host-supplied fonts for re-rendering, imported-layout diagnostics and bounded cached-mixer selection.
 * `addActiveFace` accepts active sfnt/TTC faces without adding raster fonts; `add` also adds standalone fonts
 * for rerasterization. Empty input preserves
 * existing cached rendering and abstains from font-dependent witnesses. Nothing is loaded from the system. One
 * library serves any number of documents: [`DocumentHandle::render`], [`DocumentHandle::document_fonts`] and
 * [`DocumentHandle::text_support`] take it by reference. Fonts share their bytes, so a render copies none.
 */
export class PsdFontLibrary {
  free(): void;
  /**
   * Supplies an active TrueType face for imported-layout diagnostics and bounded cached-mixer selection.
   * Pass original `.ttf` or TrueType `.ttc`/`.otc` bytes, the actual zero-based `faceIndex`, and a host source
   * identifier `provenance`, such as a path or asset ID. The returned PostScript name comes from the face;
   * CSS family names cannot substitute for bytes. Preserve collection indices: Helvetica Neue regular 0,
   * bold 1, light 7, medium 10; STHeitiSC-Light is index 1 in its original collection.
   * Pass this library to render/renderRegion/renderOverview with `typeLayers: false`. For missing-font
   * decisions also pass a trustworthy `availableFonts` PostScript-name inventory; omit unknown inventories.
   * `availableFonts` is ignored without active bytes, preserving previous name-only viewer behavior.
   * Supported RGB8 schema-7 global-style cmap or coherent descender conflicts use ordinary document mixing,
   * retaining the cached raster. A bounded direct-Latin glyph-conflict certificate admits this cached return
   * in strict mode with `typeLayers: false`; other conflicts retain the CachedRaster diagnostic or refusal.
   * Absence of a conflict stays unresolved. Without active bytes the previous rendering behavior is preserved.
   * This does not add raster fonts or install fonts. CFF, invalid indices and unreadable/unnamed faces throw.
   * Repeated identical bytes/index deduplicate; distinct faces under one name abstain. Partial face input
   * checks only uniquely resolved supplied faces and never implies absent faces are unavailable.
   */
  addActiveFace(bytes: Uint8Array, face_index: number, provenance: string): string;
  /**
   * Supplies Photoshop 26.0.0's `hyph_en_US.dic`, which hyphenated paragraph text needs; the crate verifies its
   * SHA-256 and throws `PsdUnsupportedError` for other dictionaries.
   */
  setHyphenationDictionary(bytes: Uint8Array): void;
  /**
   * Adds a TrueType (`glyf`) or OpenType CFF font file under its PostScript name (`name` ID 6), replacing a font of
   * the same name for rerasterization, and returns its entry as [`Self::fonts`] lists it. Throws `PsdUnsupportedError` for font
   * collections (`.ttc`, `.otc`), WOFF files and fonts without a PostScript name or with outlines the crate does not
   * read, and `PsdError` for bytes that are not a readable font. The host attests this is an active face.
   * TrueType bytes also feed imported-layout diagnostics and cached-mixer selection independently of
   * `typeLayers`; distinct bytes sharing
   * a name make validation ambiguous even though the rerasterization library replaces its earlier entry.
   */
  add(bytes: Uint8Array): any;
  /**
   * An empty library.
   */
  constructor();
  /**
   * The fonts added, sorted by PostScript name: `name`, `format` (`TrueType` or `CFF`) and `size` in bytes.
   */
  fonts(): Array<any>;
}
/**
 * A host-owned file with u64 spans. The callback `(offset: bigint, length: number) => Uint8Array`
 * must synchronously read exactly the requested window. In a worker use
 * `new Uint8Array(new FileReaderSync().readAsArrayBuffer(blob.slice(Number(offset), Number(offset)+length)))`.
 * Keep the blob and callback alive until free(). No complete file is copied into WASM.
 */
export class PsdSourceHandle {
  private constructor();
  free(): void;
  /**
   * Lists physical primary layer records and bigint compressed-channel spans without reading pixels.
   * Alternate Lr16/Lr32 carriers currently throw a typed unsupported refusal; savedRegion stays available.
   * Options use PsdBudgetOptions; metadata and JavaScript copies are admitted before publication.
   */
  layerInfo(options: PsdBudgetOptions | null | undefined): PsdSourceLayer[];
  /**
   * Reads native original layer or mask pixels through host-owned source windows.
   * Metadata is indexed per call; compressed streams remain in the file. Primary layer records only.
   * Each channel clips independently; missing channels and alternate carriers throw typed errors.
   */
  layerRegion(index: number, rect: PsdNativeRect, ids: Int16Array, options: PsdBudgetOptions | null | undefined): PsdNativeRegion;
  /**
   * Reads selected saved process/alpha/spot planes directly from host file windows at native depth.
   * No whole-file UI buffer or WASM compressed-file copy is needed, including for large RGB16 files.
   * Saved pixels may be stale and retain their matte. Does not validate rows after the window.
   * Options use PsdBudgetOptions; throws typed budget/corruption errors before oversized reads.
   */
  savedRegion(rect: PsdNativeRect, indices: Uint16Array, options: PsdBudgetOptions | null | undefined): PsdNativeRegion;
  /**
   * Emits original file bytes in chunks of at most 64 KiB. The callback must consume each
   * Uint8Array before returning. It must not accumulate unaccounted chunks in linear memory.
   */
  writeUnchanged(emit: Function, options: PsdBudgetOptions | null | undefined): void;
  /**
   * Returns native header fields and logical section spans, with bigint offsets/lengths.
   */
  info(): any;
  /**
   * Reads strict outer envelopes without repairing or materializing inner sections.
   * Default budget is 64 MiB per allocation, 512 MiB live, i64::MAX offsets and depth 64.
   * Options `allocationBytes`, `liveBytes`, `maxOffset`, `maxDepth`, `retainedBytes` override per call.
   */
  static open(read: (offset: bigint, length: number) => Uint8Array, length: bigint, options: PsdBudgetOptions | null | undefined): PsdSourceHandle;
  /**
   * Decodes a channel grid from a payload span without its compression word. Native planar
   * bytes are returned, including packed bits, big-endian words and IEEE payloads. ZIP/RLE
   * rows after the requested region remain unvalidated. Uses the same per-call budget defaults as open().
   */
  readGrid(offset: bigint, length: bigint, compression: number, width: number, rows: number, depth: number, psb: boolean, left: number, top: number, grid_width: number, grid_height: number, step: number, options: PsdBudgetOptions | null | undefined): Uint8Array;
}
/**
 * One composite: straight 8-bit RGBA for display and, for 16- and 32-bit documents, the composite at their depth, or
 * for CMYK and Lab documents the composite in their own channels.
 */
export class RenderedImage {
  private constructor();
  free(): void;
  /**
   * The documented approximations the render made, in words: the display conversion of a CMYK or Lab composite
   * made exactly in its channels, or what `approximate` allowed; empty when the render followed the exact path to
   * its display.
   */
  approximations(): Array<any>;
  /**
   * The composite as straight 8-bit RGBA, row by row: a fresh copy each call. 16-bit samples convert with
   * `R(q·255, 32768)`, 32-bit color with Photoshop's Exposure and Gamma toning at its defaults and alpha with
   * `⌊255a + ½⌋`; CMYK and Lab composites convert to sRGB through the approximate color management the
   * approximations name.
   */
  rgba8(): Uint8Array;
  /**
   * The depth the composite was computed at: 8, 16 or 32.
   */
  readonly depth: number;
  /**
   * Width in pixels.
   */
  readonly width: number;
  /**
   * Height in pixels.
   */
  readonly height: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_psddocumenthandle_free: (a: number, b: number) => void;
  readonly __wbg_psdfontlibrary_free: (a: number, b: number) => void;
  readonly __wbg_psdsourcehandle_free: (a: number, b: number) => void;
  readonly __wbg_renderedimage_free: (a: number, b: number) => void;
  readonly computeTypeGlyphInk26: (a: any, b: any, c: number, d: number) => [number, number, number, number];
  readonly computeTypeHorizontalPens26: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
  readonly computeTypeManualBaselines26: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
  readonly formatTypeEngineReal26: (a: number) => [number, number, number, number];
  readonly projectTypeEngineGeometry26: (a: number, b: number, c: any) => [number, number, number, number];
  readonly projectTypeEngineLayoutCache26: (a: number, b: number, c: any) => [number, number, number, number];
  readonly projectTypeEngineSave26: (a: number, b: number, c: any) => [number, number, number, number];
  readonly projectTypeEngineSelection26: (a: number, b: number, c: any) => [number, number, number, number];
  readonly psddocumenthandle_difference: (a: number, b: number) => [number, number, number];
  readonly psddocumenthandle_documentFonts: (a: number, b: number) => any;
  readonly psddocumenthandle_info: (a: number) => any;
  readonly psddocumenthandle_layerDetail: (a: number, b: number) => [number, number, number];
  readonly psddocumenthandle_layerPixels: (a: number, b: number) => [number, number, number];
  readonly psddocumenthandle_layerRegion: (a: number, b: number, c: any, d: number, e: number, f: any) => [number, number, number];
  readonly psddocumenthandle_layers: (a: number) => [number, number, number];
  readonly psddocumenthandle_merged: (a: number) => [number, number, number];
  readonly psddocumenthandle_open: (a: number, b: number) => [number, number, number];
  readonly psddocumenthandle_openLikePhotoshop: (a: number, b: number, c: any) => [number, number, number];
  readonly psddocumenthandle_openLikePhotoshopWithBudget: (a: any, b: any, c: any) => [number, number, number];
  readonly psddocumenthandle_openWithBudget: (a: any, b: any) => [number, number, number];
  readonly psddocumenthandle_regionCapability: (a: number, b: any, c: any, d: number) => [number, number, number];
  readonly psddocumenthandle_render: (a: number, b: any, c: number) => [number, number, number];
  readonly psddocumenthandle_renderColor: (a: number, b: any, c: any, d: number) => [number, number, number];
  readonly psddocumenthandle_renderNativeRegion: (a: number, b: any, c: any, d: number) => [number, number, number];
  readonly psddocumenthandle_renderOverview: (a: number, b: number, c: any, d: number) => [number, number, number];
  readonly psddocumenthandle_renderRegion: (a: number, b: number, c: number, d: number, e: number, f: any, g: number) => [number, number, number];
  readonly psddocumenthandle_renderRegions: (a: number, b: any, c: any, d: number) => [number, number, number];
  readonly psddocumenthandle_renderWithBudget: (a: number, b: any, c: number, d: any) => [number, number, number];
  readonly psddocumenthandle_savedOverview: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly psddocumenthandle_savedPaths: (a: number, b: any) => [number, number, number];
  readonly psddocumenthandle_savedProcessChannels: (a: number, b: number) => [number, number, number];
  readonly psddocumenthandle_savedRegion: (a: number, b: any, c: number, d: number, e: any) => [number, number, number];
  readonly psddocumenthandle_states: (a: number) => any;
  readonly psddocumenthandle_textSupport: (a: number, b: number, c: number) => [number, number, number];
  readonly psdfontlibrary_add: (a: number, b: number, c: number) => [number, number, number];
  readonly psdfontlibrary_addActiveFace: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
  readonly psdfontlibrary_fonts: (a: number) => any;
  readonly psdfontlibrary_new: () => number;
  readonly psdfontlibrary_setHyphenationDictionary: (a: number, b: number, c: number) => [number, number];
  readonly psdsourcehandle_info: (a: number) => [number, number, number];
  readonly psdsourcehandle_layerInfo: (a: number, b: any) => [number, number, number];
  readonly psdsourcehandle_layerRegion: (a: number, b: number, c: any, d: number, e: number, f: any) => [number, number, number];
  readonly psdsourcehandle_open: (a: any, b: bigint, c: any) => [number, number, number];
  readonly psdsourcehandle_readGrid: (a: number, b: bigint, c: bigint, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: any) => [number, number, number, number];
  readonly psdsourcehandle_savedRegion: (a: number, b: any, c: number, d: number, e: any) => [number, number, number];
  readonly psdsourcehandle_writeUnchanged: (a: number, b: any, c: any) => [number, number];
  readonly rasterizeCff2Strong: (a: number, b: number, c: any, d: any, e: number, f: number, g: number) => [number, number, number];
  readonly readPsd: (a: number, b: number) => [number, number, number];
  readonly readPsdMetadataQueries: (a: number, b: number) => [number, number, number];
  readonly readPsdSource: (a: number, b: number) => [number, number, number];
  readonly readTypeFontMetrics26: (a: number, b: number, c: number) => [number, number, number];
  readonly renderedimage_approximations: (a: number) => any;
  readonly renderedimage_depth: (a: number) => number;
  readonly renderedimage_height: (a: number) => number;
  readonly renderedimage_rgba8: (a: number) => any;
  readonly renderedimage_width: (a: number) => number;
  readonly writePsd: (a: any, b: number, c: number, d: any) => [number, number, number, number];
  readonly writeTypeEngineValues26: (a: number, b: number) => [number, number, number, number];
  readonly writeTypeLayerGlyphs26: (a: number, b: number, c: any, d: any, e: number) => [number, number, number, number];
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
