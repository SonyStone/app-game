/* tslint:disable */
/* eslint-disable */
/**
 * Writes an 8-bit RGB document of `document.layers` and the straight RGBA `composite`; PSB above 30000
 * pixels on a side.
 */
export function writePsd(document: any, composite: Uint8Array): Uint8Array;
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
 * Check prepared native-layout bytes under the closed Photoshop 26 v1 contract.
 * Throws on unsupported metadata layouts. A false result grants no save certificate.
 */
export function checkPhotoshop26Save(left: Uint8Array, right: Uint8Array): any;
/**
 * Write one saved-history event using explicit retained metadata state.
 * If retained_instance_id matches the final event's instanceID, updates only action,
 * instanceID, when and softwareAgent. Otherwise appends a saved event. Earlier events
 * and unrelated fields survive. Omit retained_instance_id for an empty retained state.
 * After success the caller retains context.instanceId for the next writer call.
 * Returns independent XMP bytes and never mutates a session. This is a writer primitive,
 * not a save certificate: longer histories still refuse editRasterTreeExact because
 * fresh save-copy import does not yet establish the retained state. No clock or ID is
 * generated. Invalid native element-form XMP or context throws TypeError.
 */
export function writeSavedHistory(xmp: Uint8Array, context: PsdPhotoshop26SaveContext, retained_instance_id?: string | null): Uint8Array;
/**
 * Generate an independent baseline JPEG in Photoshop 26's resource-1036 envelope.
 * Complete sRGB8 RGBA canvas pixels and explicit resolution are required. Resizing
 * refuses. This proves thumbnail generation only, never editor-save equivalence.
 */
export function generatePhotoshop26Thumbnail(width: number, height: number, resolution: number, rgba: Uint8Array): Uint8Array;
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



/** Current-state writes. All failures preserve bytes and revision. Merged output is rebuilt strictly.
 * RGB8 primary layers up to 2000x1000 only. No timeline, color-dissolve or OCIO authoring admission. */
export type PsdCarrierEdit =
  | { readonly kind: 'effectsVisible'; readonly visible: boolean }
  | { readonly kind: 'dissolveOpacity'; readonly recordIndex: number; /** Integral 0..255. */ readonly opacity: number };
/** Explicit-context reopen-equivalent requests. Context-free nonempty batches refuse.
 * Empty context-free batches certify no save. IDs and payloads keep their semantic meanings. */
export type PsdExactRasterTreeEdit =
  | Extract<M01Edit, { readonly kind: 'replacePixels' | 'paintPixels' | 'insertRaster' | 'insertGroup'
      | 'delete' | 'move' | 'rename' | 'opacity' | 'fill' | 'blend' | 'visible' | 'setMask' }>
  | Extract<PsdProcessEdit, { readonly kind: 'replaceProcessPlanes' | 'renameProcessLayer' | 'setProcessOpacity' }>;
/** Native source metadata only. Inspection grants no edit admission and performs no display conversion. */
export interface PsdProcessSource {
  /** PSD color-mode number. */ readonly mode: number;
  /** Native bits per sample. */ readonly depth: number;
  readonly width: number;
  readonly height: number;
  /** Stored merged channel count. */ readonly channels: number;
  readonly mergedTransparency: boolean;
  /** Physical source order. Reinspect after structural edits. */
  readonly layers: readonly {
    readonly recordIndex: number;
    /** Persistent lyid, null if absent. */ readonly layerId: number | null;
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    /** Stored channel IDs in stream order; this is not process-plane replacement order. */
    readonly channelIds: readonly number[];
  }[];
}
/** Native wire-plane commands. Mode, depth and existing rectangle are inherited from inspectProcess().
 * Big-endian bytes retain native precision. CMYK is inverted; alpha is last. No display conversion.
 * Only bounded flat Normal Gray8/16, RGB16/32 and CMYK8 products admit. Failures are atomic. */
export type PsdProcessEdit =
  | { readonly kind: 'replaceProcessPlanes'; readonly layerId: number;
      /** Complete native process planes then alpha, matching existing bounds. Array bytes are checked before casting. */
      readonly planes: readonly (Uint8Array | readonly number[])[] }
  | { /** Fixed-canvas RGB16 PSD/PSB translation. Requires canonical Q15 words and nonzero alpha at every stored edge.
       * Masks, groups, coordinate dependencies and transparent borders refuse atomically. Encoded planes remain unchanged. */
      readonly kind: 'moveProcessLayer'; readonly layerId: number;
      /** Signed i32 horizontal pixels; translated bounds must pass the native coordinate budget. */ readonly dx: number;
      /** Signed i32 vertical pixels; translated bounds must pass the native coordinate budget. */ readonly dy: number }
  | { readonly kind: 'setProcessOpacity'; readonly layerId: number; /** Integral native byte. */ readonly opacity: number }
  | { readonly kind: 'renameProcessLayer'; readonly layerId: number; /** Control-free valid Unicode, at most 255 UTF-16 units. */ readonly name: string };
/** Existing version-2 Lab or version-3 XYZ CMYK settings. Color encoding must match the source. Unsupported products refuse atomically. */
export type PsdCmykPhotoFilterPatch = {
  /** Integral 1..100; omission preserves source. */ readonly density?: number;
  /** Preserve CMY luminance and source K; omission preserves source. */ readonly preserveLuminosity?: boolean;
} & (
  | {
      /** Version-2 encoded u16 Lab words. L is in hundredths, signed a/b hundredths are represented as u16. */
      readonly lab?: readonly [number, number, number];
      readonly xyz?: never;
    }
  | {
      /** Version-3 source u32 XYZ words. High bits remain source data. Cannot accompany lab. */
      readonly xyz?: readonly [number, number, number];
      readonly lab?: never;
    }
);
/** Native lifecycle supplied by the save host. No system clock or random identities are implicit.
 * Replaces the final existing saved history event in the admitted canonical PS26 packet. */
export type PsdMetadataSaveContext = {
  /** Local timestamp with seconds and explicit offset, YYYY-MM-DDTHH:MM:SS+HH:MM. Updates XMP dates and EXIF DateTime. */
  readonly modifiedAt: string;
  /** xmp.iid: followed by a lowercase UUID. Also replaces the final saved history instance. */
  readonly instanceId: string;
  /** adobe:docid:photoshop: followed by a lowercase UUID, supplied by the save host. */
  readonly documentId: string;
};
/** Nonvisual metadata writes. Every failed batch preserves revision and source bytes. */
export type PsdStateMetadataEdit =
  | { readonly kind: 'compHeader'; readonly compId: number; readonly name?: string; readonly comment?: string }
  | {
      readonly kind: 'guides';
      /** Stored u32 grid periods. Both document-guide resources update together. */ readonly grid: readonly [number, number];
      /** Signed i32 location in 1/32 pixel, 0 vertical/1 horizontal, unsigned ARGB word. */
      readonly guides: readonly { readonly location: number; readonly direction: 0 | 1; readonly argb: number }[];
    }
  | { readonly kind: 'noteText'; readonly index: number; readonly text: string }
  /** Coordinates existing 1083/Cptn and 1011 caption slots. Other print fields and pixels survive. */
  | { readonly kind: 'printCaption'; readonly enabled: boolean }
  /** Existing authored v6/v7/v8 slice. Geometry, partitions and IDs survive. */
  | { readonly kind: 'sliceName'; readonly sliceId: number; readonly name: string }
  /** Coordinates 1050 and existing 1054/slic. No URL is fetched; malformed dependencies refuse. */
  | { readonly kind: 'sliceUrl'; readonly sliceId: number; readonly url: string }
  /** Existing positive i32 comp ID, all-layer visibility only. Coherent saved flat unmasked RGB8 rasters.
   * Preserves IDs/flags/state 0 and current caches. Pending edits and unsupported captured domains refuse. */
  | { readonly kind: 'captureCompVisibility'; readonly compId: number }
  /** Positive exact signed-16.16 ppi without resampling. Plain RGB8 PSD rasters without XMP.
   * Coordinates existing resolution/print/EXIF carriers and preserves units, unknown bytes and caches.
   * Text/smart/vector/style/mask/state content and unsupported companion layouts refuse atomically. */
  | { readonly kind: 'rasterResolution' | 'resolutionNoResample'; readonly ppi: number }
  /** Only publicDomain is admitted, with supplied lifecycle and canonical simple PS26 companions.
   * Other transitions and missing context return Dependency. Untouched packet setters are separate. */
  | { readonly kind: 'fileInfoCopyright'; readonly status: 'copyrightedWork' | 'publicDomain' | 'unmarked'; readonly saveContext?: PsdMetadataSaveContext }
  /** Typed dependency refusals until complete companion serialization is certified. */
  | { readonly kind: 'fileInfoTitle'; readonly title: string }
  /** Refuses until XMP aliases, mappings, digests and lifecycle can be reconciled together. */
  | { readonly kind: 'xmpProperty'; readonly namespace: string; readonly name: string; readonly value: string }
  /** Refuses until automatic partitions and caller-supplied process IDs can be saved together. */
  | { readonly kind: 'rebuildAutomaticSlices' }
  /** Named refusals until complete dependent writers have native acceptance. */
  | { readonly kind: 'applyComp' | 'captureComp' | 'slices' | 'xmp' | 'printOptions' | 'resolution' };

/** Linear interpolation/style only, with sampled sRGB and Dot Gain 20%. Other context refuses atomically. */
export type LinearGradientFillPatch = Omit<GradientFillPatch, 'style'> & { readonly style?: 'linear' };
/** Perceptual interpolation, Linear style, sampled sRGB and Dot Gain 20%. Other context refuses atomically. */
export type PerceptualGradientFillPatch = Omit<GradientFillPatch, 'style'> & { readonly style?: 'linear' };
/** Partial repaint of a sole RGB8 Classic canvas GdFl. Empty patch regenerates existing stops cache-free. */
export interface GradientFillPatch {
  /** Finite degrees. Omitted fields retain descriptor precision. */ angle?: number;
  /** Percent in 10 through 150. */ scale?: number;
  /** Horizontal and vertical canvas percentages in -100 through 100. */ offset?: readonly [number, number];
  /** Reverse lookup without reordering stops. */ reverse?: boolean;
  /** Classic geometry. Interpolation cannot be changed by this operation. */ style?: 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond';
  /** Existing stop indices; components in 0 through 255, normalized as 255*f32(c/255). */ colors?: readonly {index: number; rgb: readonly [number,number,number]}[];
  /** Existing stop indices; opacity in 0 through 100, normalized to native byte opacity. */ opacities?: readonly {index: number; percent: number}[];
}
/** Replacement bytes are owned inputs; stored external paths are never read. Same-size positive-alpha
 * untagged PNG, one identity Surface Blur stack, fresh distinct canonical UUIDs. */
export interface PsdSurfaceBlurContents {
  /** Caller-supplied noninterlaced untagged RGB8/RGBA8 PNG, at most 16,000,000 bytes, no zero alpha. */
  readonly bytes: Uint8Array;
  /** Nonempty stored filename without NUL or path separators. No file is opened at this name. */
  readonly filename: string;
  /** Fresh canonical UUID, distinct from placementId and both current source identities. */
  readonly contentId: string;
  /** Fresh canonical UUID shared by the new placement and regenerated FEid cache association. */
  readonly placementId: string;
}

/** Bounded source edits for the sole smart layer over one opaque raster backdrop. No stored path is opened. */
export type PsdSmartEdit =
  | {
      /** Integer unscaled upright placement. Both quads and the legacy carrier update together. */ kind: 'setSmartTransform';
      /** Top-left, top-right, bottom-right, bottom-left document-pixel pairs. */ quad: readonly [number,number,number,number,number,number,number,number];
    }
  | {
      /** Same-source integer axis transform; source identity stays fixed and placementId must be fresh. */
      kind: 'setSmartAxisTransform';
      quad: readonly [number, number, number, number, number, number, number, number];
      placementId: string;
      /** Required host preference. Bilinear retains at least half of each axis, or uses exact
       * power-of-two bins of at least four samples on both axes. */
      interpolation: 'nearestNeighbor' | 'bilinear';
    }
  | {
      /** Same-size untagged RGB/RGBA PNG with positive alpha. */ kind: 'replaceSmartContents';
      /** Owned source bytes, at most 16000000. */ bytes: Uint8Array;
      /** Leaf filename without NUL or directory separators. */ filename: string;
      /** Fresh canonical UUID, distinct from either old ID and placementId. */ contentId: string;
      /** Fresh canonical UUID for this placement, distinct from either old ID and contentId. */ placementId: string;
    }
  /** These operations always throw Dependency with a smart.* propertyPath until separately certified. */
  | { readonly kind: 'duplicateSmart' | 'applySmartComp' | 'appendSmartFilter' | 'updateSmartLink' };
/** Existing sole identity Surface Blur settings. Unsupported dependencies refuse atomically. */
export interface PsdSurfaceBlurEdit {
  /** Finite pixels in 0..100. The serialized binary64 radius retains its fractional precision. */
  readonly radius: number;
  /** Integer byte threshold in 2..255. */
  readonly threshold: number;
  /** Fresh canonical host UUID, distinct from both current content and placement UUIDs. */
  readonly placementId: string;
}
/** Source-only rename. Names use the existing control-free, 255 UTF-16-unit limit. */
export interface PsdContextRename {
  readonly layerId: number;
  readonly name: string;
}
/** Independent current source bytes. Pending caches may be stale; this is not a prepared save. */
export interface PsdContainerSnapshot {
  readonly revision: bigint;
  readonly bytes: Uint8Array;
}
/** Source change and actual cache work are independent, including earlier pending visual edits. */
export interface PsdMutationSave {
  readonly change: 'unchanged' | 'sourceOnly' | 'visual';
  readonly caches: 'preserved' | 'rebuilt';
  readonly save: PsdPreparedSave;
}
/** A frozen save and its effective RGB blending operand. No general host-state certificate. */
export interface PsdContextualSave {
  readonly save: PsdPreparedSave;
  readonly rgbBlending: { readonly kind: 'assumed' | 'supplied'; readonly value: boolean };
}
/** Snapshot of the admitted RGB8 identity tree. Scalars use byte opacity/Fill. */
export interface M01Snapshot { readonly revision: bigint; readonly width: number; readonly height: number; readonly identityFloor: number; readonly saveBlocked: boolean; readonly selected: readonly number[]; readonly layers: readonly M01Layer[]; }
/** Group children are bottom-to-top; endId is reserved and cannot be edited. */
export interface M01Layer { readonly id: number; readonly endId: number | null; readonly name: string; readonly visible: boolean; readonly opacity: number; readonly fill: number; readonly blend: string; readonly clipped: boolean; readonly link: number | null; readonly linkEnabled: boolean | null; readonly children: readonly M01Layer[]; }
/** Explicit save-copy operands. The transaction generates no timestamps or identities. */
export interface PsdPhotoshop26SaveContext {
  /** Opened document basename without extension, not the output destination. */
  readonly basename: string;
  /** ISO8601 current-save timestamp with seconds and an explicit timezone. */
  readonly saveTime: string;
  /** Local EXIF current-save timestamp in YYYY:MM:DD HH:MM:SS format. */
  readonly exifTime: string;
  /** Current-save UUID prefixed with xmp.iid:. */
  readonly instanceId: string;
  /** Save-copy UUID prefixed with adobe:docid:photoshop:. */
  readonly documentId: string;
  /** Native Photoshop agent string, such as Adobe Photoshop 26.0 (Macintosh). */
  readonly softwareAgent: string;
  /** Explicit host RGB gamma-1 blending setting, which PSD does not store. */
  readonly linearBlending: boolean;
}
export interface PsdEditorSession {
  /**
   * Apply a bounded Photoshop 26 reopen-equivalent transaction with explicit host operands.
   * RGB8 PSD/PSB admits selected-raster properties, opaque same-bounds pixels and
   * raster insertion/deletion/reorder inside the measured one-level group domain.
   * RGB16 PSD admits native rename/opacity. Gray8 and embedded-SWOP CMYK8 admit
   * native rename/opacity/opaque process-plane replacement, with explicit preview context.
   * Same-target scalar batches admit flat plain RGB8 sources and one final target time.
   * setMask replaces an existing enabled independent RGB8 mask's samples at the same
   * rectangle, retaining its default, all other streams and source alpha. It needs a target time.
   * Retained effects admit the measured drop-shadow and two Bevel modern/legacy pairs.
   * The measured shadow admits Fill and Normal-to-Screen/Multiply; other styled blends refuse.
   * Sources require one created and one saved XMP event, measured embedded profiles,
   * native-default metadata, 72 ppi, opaque samples/output and an unscaled preview.
   * Positions are bottom to top, after removal. Insert allocates above resource 1044 and
   * every physical ID, including group ends, selects it and returns it in created. Resource
   * 1024 counts zero-based physical indices including group markers; 1069 stores selected IDs.
   * Insert requires the new ID's explicit time. Delete selects the survivor below, falling back
   * above. Reorder/delete/hide preserve times. Other edits require explicit target times.
   * Nested groups, group creation/subtree changes, longer source history, RGB16 pixels,
   * density/feather/vector-mask editing, auxiliary channels, custom metadata, mixed-target
   * or structural batches, other profiles and active OCIO retain named atomic refusals.
   * Success freezes complete prepared bytes at either later gamma. Failure preserves
   * source, selection, allocation and revision. Missing context retains the earlier refusal.
   * JPEG entropy bytes and Adobe container serialization are outside this contract.
   */
  editRasterTreeExact(batch: readonly PsdExactRasterTreeEdit[], context?: PsdReopenSaveContext): M01EditOutcome;
}
/** Versioned opt-in with explicit current-save and per-edit layerTime values. */
export interface PsdReopenSaveContext {
  /** Selects the bounded Photoshop 26 reopen-equivalent contract. */
  readonly contract: "photoshop26.reopen-equivalent/v1";
  /** Current-save values and the blending operand used to prepare the frozen source. */
  readonly save: PsdPhotoshop26SaveContext;
  /** Required for RGB16, Gray8 and CMYK8. The source ICC stays embedded and byte-preserved.
   * Missing or unverified conversion operands refuse atomically. RGB8 callers may omit it. */
  readonly preview?: {
    /** Original destination sRGB ICC bytes; no substitute profile is generated. */
    readonly srgbProfile: Uint8Array;
    /** Only the measured relative-colorimetric route is admitted. */
    readonly intent: 'relativeColorimetric';
    /** Must be true for native preview conversion. */
    readonly blackPointCompensation: boolean;
    /** Must be false; preview conversion dither is unverified. */
    readonly dither: boolean;
    /** Must be false; active OCIO conversion is unverified. */
    readonly ocio: boolean;
  };
  /** Exactly one target time for rename/opacity/Fill/blend/pixels/mask or the new ID
   * for insertion. Empty for hide, deletion and movement, which preserve surviving times.
   * Times must be finite and positive. Other, duplicate or missing layer IDs refuse.
   */
  readonly layerTimes: readonly {
    /** Target identity, or the allocated new identity for insertion. */
    readonly layerId: number;
    /** Explicit native edit-time value in seconds; no clock is read. */
    readonly time: number;
  }[];
}
/** IDs correspond to insertions in batch order; refusals leave all state unchanged. */
export interface M01EditOutcome { readonly revision: bigint; readonly created: readonly number[]; readonly diagnostics: readonly never[]; }
/** Absolute raster source mask; defaultColor is 0 or 255. Extents/samples remain untrimmed. */
export interface RasterMask { left: number; top: number; width: number; height: number; samples: Uint8Array; defaultColor: number; disabled: boolean; }
/** Read-only CFF1 layout result. No complete ink descriptor or saved text transaction is supplied. */
export interface PsdCffLayoutCachePlan {
  readonly kind: 'cffLayoutOnly';
  /** Ordered named EngineData bytes with updated text/runs and unchanged font resources. */
  readonly localEngine: Uint8Array;
  /** Ordered numeric Model/View EngineData bytes with rebuilt mappings and L/S/G records. */
  readonly globalEngine: Uint8Array;
  /** Local layout bounds, excluding unresolved ink bounds. */
  readonly layoutBounds: readonly [number, number, number, number];
  /** Retained signed 16.16 em ascent/descent for the unchanged font and size. */
  readonly selectionMetricWords: readonly [number, number];
  /** Fresh straight RGBA and bounds, generated without destination pixels. */
  readonly raster: { readonly left: number; readonly top: number; readonly width: number; readonly height: number; readonly rgba: Uint8Array };
}
/** One canonical path in document pixels. Finite, nondegenerate coordinates only; no strokes or live origination. */
export interface SimpleShape { kind: 'rectangle' | 'ellipse'; left: number; top: number; right: number; bottom: number; }
/** Exact straight RGB8 source samples. Zero-by-zero clears; other extents and buffers must agree. */
export interface RasterPixels { left: number; top: number; width: number; height: number; rgba: Uint8Array; }
/** Positions are bottom-to-top, measured after removal for moves. All batches are atomic. */
/** Uniform setters applied after text mutation. Omitted fields preserve current values.
 * Bounded printable ASCII/CR, left horizontal Crisp point or left/center/right Single-line RGB8 boxes.
 * Center/right require integral font size and zero tracking. Other text-4 admission gates still apply.
 * Register original/requested and whitespace-marker fonts using addTextFont.
 */
export interface PsdTextStylePatch {
  /** Single-line alignment or fitting Every-line terminal alias. Aligned/Every-line boxes require integral size and zero tracking. Two alphabetic words may wrap with a forced, well-separated break in left/center/right modes. Wrapped style mutations, general composition, full justification and hyphenation refuse. */
  readonly justification?: 'left' | 'center' | 'right' | 'justifyLastLeft' | 'justifyLastRight' | 'justifyLastCenter';
  readonly font?: string;
  readonly size?: number;
  readonly tracking?: number;
  readonly leading?: number;
  readonly baseline?: number;
  readonly color?: readonly [number, number, number];
}
export type M01Edit =
  /** Caller-supplied actual fonts required. Text-only batches; mixed raster/type batches refuse. */
  | ({kind: 'setText'; layerId: number; text: string} & PsdTextStylePatch)
  | {kind: 'insertRaster'; parent?: number | null; index: number; raster: {name: string; left: number; top: number; width: number; height: number; pixels: Uint8Array}}
  /** Replace source pixels/bounds while retaining metadata. Groups/generators refuse. */
  | {kind: 'replacePixels'; layerId: number; pixels: RasterPixels}
  /** Replace this patch's samples, extending bounds. Invalid or empty patches refuse. */
  | {kind: 'paintPixels'; layerId: number; pixels: RasterPixels}
  /** Create/edit/delete independent raster source. Null removes only the source, preserving a vector. */
  | {kind: 'setMask'; layerId: number; mask: RasterMask | null}
  /** Create/edit/delete a simple vector mask, keeping real source and combined cache distinct. */
  | {kind: 'setVectorMask'; layerId: number; shape: SimpleShape | null}
  /** Convert/edit a simple solid with coherent mirrors/caches. Null shape paints the canvas. */
  | {kind: 'setSolid'; layerId: number; color: readonly [number, number, number]; shape?: SimpleShape | null}
  | {kind: 'insertGroup'; parent?: number | null; index: number; name: string}
  | {kind: 'delete'; layerId: number}
  | {kind: 'move'; layerId: number; parent?: number | null; index: number}
  | {kind: 'rename'; layerId: number; name: string}
  | {kind: 'visible'; layerId: number; visible: boolean}
  | {kind: 'opacity'; layerId: number; opacity: number}
  | {kind: 'fill'; layerId: number; fill: number}
  | {kind: 'blend'; layerId: number; blend: string}
  | {kind: 'clip'; layerId: number; clipped: boolean};
/** Atomic geometry command. Refused kinds reserve names only; no metadata-only edit is performed. */
export type PsdGeometryEdit =
  | {
      /** Strict clipping/background resize; children retain document coordinates. */ kind: 'resizeArtboard';
      /** Physical artb group index from inspectSource(), invalidated by structural edits. */ recordIndex: number;
      /** Nonzero committed pixel width. */ width: number;
      /** Nonzero committed pixel height. */ height: number;
    }
  | { /** Explicit save-shrinkwrap for visible RGB8 root boards with enabled auto-expand/shrinkwrap, equal integer origins
       * and bounded raster/group descendants. Translates bounds, linked masks and reference points, updates origins/canvas,
       * and strictly rebuilds merged pixels. Requires an explicit host gamma boolean. Failed/no-op edits preserve revision. */
      kind: 'shrinkwrapArtboards' }
  | { /** Named refusal until coherent creation and extent policy exist. */ kind: 'createArtboard' }
  | {
      /** Translate a fixed-canvas RGB8 root board and plain Normal raster subtree, with ordinary linked masks.
       * Requires unique IDs and disabled auto-expand, shrinkwrap, positioning and nesting. Other coordinate
       * carriers, live content and effects refuse atomically. Rebuilds merged pixels and drops previews.
       */ kind: 'moveArtboard';
      /** Physical artb group index from inspectSource(), invalidated by structural edits. */ recordIndex: number;
      /** Integer horizontal displacement; translated coordinates must remain strictly within +/-2000. */ dx: number;
      /** Integer vertical displacement; translated coordinates must remain strictly within +/-2000. */ dy: number;
    }
  | {
      /** Integer translation of the sole unstroked type-1 live rectangle in bounded RGB8 PSD.
       * Updates bbox/world corners/affine history/path and cache bounds together, retains exact channel
       * streams, strictly regenerates merged pixels, and requires an explicit host gamma boolean.
       * Masks, effects, strokes, pending edits, other shapes and coordinate dependencies refuse atomically. */
      kind: 'editLiveShape';
      /** Physical source index, currently zero for the sole admitted layer. */ recordIndex: number;
      /** Integer horizontal displacement, within +/-1999 document pixels. */ dx: number;
      /** Integer vertical displacement, within +/-1999 document pixels. */ dy: number;
    }
  | { /** Named refusal until placement, resampling and caches agree. */ kind: 'replaceFrameContents' };
/** Confirmed atomic mask/channel setters. All refusals preserve source bytes and revision. */
export type PsdChannelEdit =
  | {
      /** Existing absolute, uninverted RGB8 raster source without density/feather records. prepareSave regenerates with its host gamma setting. Compound real/vector disable refuses. */
      readonly kind: 'disableRasterMask';
      /** Physical layer record index from inspectSource, invalidated by structural edits. */
      readonly recordIndex: number;
    }
  | {
      /** Native version-4 soLD/filterFXStyle with a placement-matched entirely white RGB8 bitmap. Nonwhite or missing bitmaps refuse. */
      readonly kind: 'filterMask';
      readonly recordIndex: number;
      /** Byte in 0..255, equivalent to native percent byte*100/255. Omission preserves source. */
      readonly density?: number;
      /** Finite pixels in 0..1000. No filter stack regeneration is performed. */
      readonly feather?: number;
      /** Retains the existing bitmap when disabled. */
      readonly enabled?: boolean;
    }
  | {
      /** Coordinates complete existing alpha name/display metadata, preserving samples, IDs and other resources. */
      readonly kind: 'alphaOptions';
      /** Existing persistent 1053 alpha ID, never panel position. Missing/ambiguous IDs and spot channels refuse. */
      readonly channelId: number;
      /** Nonempty control-free ASCII/supplementary text, at most 255 UTF-16 units. Other legacy encodings refuse. */
      readonly name: string;
      /** Integral 0..100. */ readonly opacity: number;
      readonly interpretation: 'selectedAreas' | 'maskedAreas';
      /** Integral RGB display bytes. This does not change alpha samples. */
      readonly color: readonly [number, number, number];
    };
/** Target for a persisted source change. Reinspect after structural edits. */
export interface PsdSourceEditTarget {
  /** Physical index in inspectSource().layers, not a semantic layer ID. */ readonly recordIndex: number;
}
/** Atomic persisted-source changes. Application state and arbitrary descriptor/metadata replacement refuse. */
export type PsdSourceEdit = PsdSourceEditTarget & (
  | {
      /** Replace the stored lock word and synchronize the transparency flag when changed. */ kind: 'locks';
      /** All 32 lspf bits. Supply reserved bits explicitly to retain them. */ bits: number;
    }
  | {
      /** Replace only the persisted color-label word. */ kind: 'label';
      /** Photoshop 26 label index, 0 through 11. Reserved bytes and tail remain intact. */ index: number;
    }
  | {
      /** Change one existing percent leaf. Save requires a certified strict RGB8 render. */ kind: 'styleOpacity';
      /** Flattened source instance index, in storage order. */ instance: number;
      /** Finite percentage in 0 through 100; no renderer-byte round trip. */ percent: number;
    }
  | {
      /** Existing enabled singleton Normal RGB overlay on a flat RGB8 raster document. Strict prepareSave refreshes merge and removes stale thumbnails. Activation, masks, groups and stacks refuse. */ kind: 'styleColorOverlayRgb';
      /** Flattened modern source instance index. */ instance: number;
      /** Integral encoded RGB bytes. */ rgb: readonly [number, number, number];
    }
  | {
      /** Change only the existing showInDialog leaf. */ kind: 'styleDialog';
      /** Flattened source instance index, in storage order. */ instance: number;
      /** UI visibility, independent from enabled and present. */ show: boolean;
    }
  | {
      /** Change a copy flag, retaining its opaque payload and envelope. */ kind: 'metadataCopy';
      /** shmd record index, including duplicates. */ entry: number;
      /** Raw copy-on-sheet byte, 0 through 255. */ copyOnSheet: number;
    }
);



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
 * Shared conservative account for explicit editor rename transactions.
 * Existing document models, supplied assets, batch strings and JS/WASM copies belong in retainedBytes.
 * Charges never refund. The first allocation/live refusal persists until this handle is freed.
 * Other editor operations and browser transfers do not automatically use this account.
 */
export class PsdAllocationContext {
  free(): void;
  /**
   * Creates an opt-in account with the WASM32 defaults and a caller-supplied retained baseline.
   * Limits govern audited payload/capacity charges, without an OS RSS or whole-program guarantee.
   */
  constructor(options: PsdBudgetOptions | undefined);
  /**
   * Cumulative admitted storage including the baseline, even after results are dropped or a call fails.
   */
  readonly retainedBytes: bigint;
}
/**
 * Persistent source-preserving editor. Opening does not fetch assets or flatten the document.
 * Native process edits additionally admit bounded Gray8/16, RGB16/32 and CMYK8 products.
 * RGB8 plain raster/group edits are atomic; unsupported dependencies throw structured Error objects.
 * Visual saves require the strict renderer, regenerate merged data and omit thumbnail 1036.
 */
export class PsdEditorSession {
  free(): void;
  /**
   * Moves/scales the sole smart layer or replaces its embedded PNG atomically. Requires one opaque raster
   * backdrop and one unfiltered Normal smart layer in unprofiled RGB8, at integer upright in-canvas bounds.
   * setSmartAxisTransform requires a fresh placementId and explicit nearestNeighbor or bilinear interpolation.
   * Bilinear retains at least half of each source axis, or reduces both into exact power-of-two bins
   * of at least four samples. Cubic scaling requires unavailable table state.
   * Replacement must have the same dimensions, positive alpha and fresh distinct host-generated UUIDs.
   * Updates SoLd/PlLd, linked bytes and lengths, parent channels/bounds and real merged data; omits thumbnails.
   * External/shared contents, filters and unsupported dependencies throw Dependency with propertyPath.
   * duplicateSmart, applySmartComp, appendSmartFilter and updateSmartLink always refuse with named paths;
   * native authoring observations alone do not certify their dependent editor writes.
   * Failure preserves bytes and revision. linearBlending is the host gamma-1 preference, false by default.
   */
  editSmart(edit: PsdSmartEdit, linear_blending?: boolean | null): M01EditOutcome;
  /**
   * Atomically edits persisted locks, labels, copy flags, style UI flags and existing percent opacity.
   * Locks change the modern source word; later legacy aliases and Background defaults remain independent.
   * Style dialog edits change the stored flag; native import may force effective visibility true.
   * Record indices come from inspectSource and change after structural edits. Opacity edits require
   * strict merged-image regeneration at prepareSave; unsupported rendering refuses the save.
   * Visual edits admit RGB8 primary layers on canvases at most 2000x1000. Labels must be in 0..11.
   * Color Overlay edits admit one enabled singleton Normal RGB effect on flat unmasked RGB8 raster layers,
   * synchronize existing legacy companions, and require strict prepareSave regeneration.
   * Arbitrary shmd/XMP replacement, other colors, nested paint edits and runtime state refuse.
   */
  editSource(batch: readonly PsdSourceEdit[]): M01EditOutcome;
  /**
   * Selects a comp for application UI only. Null clears selection; no bytes/revision change.
   * Requires a unique existing comp ID and unambiguous layer IDs. Does not apply pixels or set lastAppliedComp.
   */
  selectComp(id?: number | null): void;
  /**
   * Applies native-plane replacement, opacity and rename commands atomically in Gray8/16, RGB16/32 or CMYK8.
   * moveProcessLayer translates only alpha-tight canonical RGB16 rasters on the fixed PSD/PSB canvas.
   * IDs and bounds come from inspectProcess. Planes are complete big-endian native wire samples,
   * process channels first and alpha last; CMYK is inverted. No RGBA8 conversion occurs.
   * Requires explicit host gamma context, flat Normal rasters, measured native defaults and bounded samples.
   * RGB32 colors must be finite and alpha in 0..1. Masks, groups, generators, extra channels,
   * unsupported HDR views and unknown active dependencies throw named errors without changing revision.
   * Successful changes regenerate merged data, order depth markers before layers and remove previews.
   */
  editProcess(batch: readonly PsdProcessEdit[], linear_blending: boolean): M01EditOutcome;
  /**
   * Freezes preserve-mode bytes for this revision. Untouched output is byte-identical; rename-only saves
   * preserve all other carriers. Visual saves require exact rendering, write real merged data, set 1057 true
   * and omit 1036. Compatibility-off inputs are promoted. Throws RenderRequired with the renderer's cause.
   * Unmodeled auxiliary document planes throw Dependency rather than being replaced by merged alpha.
   * linearBlending is the host gamma-1 RGB setting, false by default; PSD does not store this preference.
   */
  prepareSave(linear_blending?: boolean | null): PsdPreparedSave;
  /**
   * Supply actual active font bytes for SetText. Nothing is loaded from the host automatically.
   * Collection index names the face in the original TTC. This changes no source or revision.
   */
  addTextFont(bytes: Uint8Array, face_index: number): void;
  /**
   * Atomically edits current effect visibility or an existing opacity-dissolve byte on RGB8 primary
   * canvases up to 2000x1000. Rebuilds real merged pixels strictly using the supplied host gamma.
   * Preserves style/anFX source and unknown fields. Record indices come from inspectSource.
   * Opacity requires flat ordinary rasters without timelines, masks, clipping or generated content.
   * Color dissolve, keyframes, duplicate/malformed carriers and other writer modes refuse atomically.
   * Higher-depth/CMYK/Lab visibility rendering grants no additional edit/save admission.
   */
  editCarriers(batch: readonly PsdCarrierEdit[], linear_blending: boolean): M01EditOutcome;
  /**
   * Applies confirmed mask/channel operations atomically, using physical record indices and persisted alpha IDs.
   * disableRasterMask admits an existing absolute uninverted RGB8 raster source without density/feather records.
   * prepareSave supplies the host linearBlending context and strictly regenerates merged caches.
   * Compound real/vector masks refuse. filterMask requires a version-4 soLD/filterFXStyle carrier and an
   * existing placement-matched entirely white RGB8 bitmap. Density is a byte, feather is pixels, and disabling
   * retains the bitmap. Nonwhite masks refuse.
   * alphaOptions coordinates ASCII/supplementary names and RGB display resources without changing samples or IDs.
   * Missing/ambiguous metadata, spot conversion and runtime allocation refuse. Reinspect after structural edits.
   */
  editChannels(batch: readonly PsdChannelEdit[]): M01EditOutcome;
  /**
   * Resizes/translates a root artboard on a fixed canvas, or explicitly applies save-shrinkwrap.
   * RGB8 PSD only, canvas at most 2000x1000, coordinates within +/-2000. Fixed-canvas edits require
   * auto-expand/shrinkwrap off. shrinkwrapArtboards requires both enabled, visible root boards, complete
   * integer origins and bounded raster/group descendants. It rebases the canvas, masks and reference points.
   * Shrinkwrap requires an explicit linearBlending boolean; ordinary saves never invoke it implicitly.
   * Rebuilds merged RGB/alpha strictly and omits stale previews before publishing the revision.
   * Live edits translate one admitted unstroked rectangle and require an explicit blending boolean.
   * Creation and frame replacement retain named typed refusals.
   * A validated zero translation preserves bytes and revision; failures preserve the complete session.
   * linearBlending is the host gamma-1 preference, required for live edits and shrinkwrap.
   * Fixed-canvas board edits default to false.
   */
  editGeometry(edit: PsdGeometryEdit, linear_blending?: boolean | null): M01EditOutcome;
  /**
   * Builds a read-only CFF1 layout plan using fonts registered with addTextFont.
   * Admits unchanged size/font at size/unitsPerEm = 1/16 for printable ASCII/CR in left Crisp point
   * or Single-line boxes, or exactly one graphic ASCII glyph at unchanged 24 points in point text.
   * Requires zero tracking/baseline and exact source raster regeneration in both domains.
   * Shaping, soft wrapping, negative extents and other dependencies throw. Revision and bytes stay intact.
   * Omits unresolved actual-size ink bounds. This plan cannot be committed by setText or prepareSave.
   */
  planCffText(layer_id: number, text: string): PsdCffLayoutCachePlan;
  /**
   * Inspects full-precision persisted source fields for any parsed container, without RGB8 tree admission.
   * Null leaves remain absent. Vector authoring includes separate bounded frame queries with explicit refusals.
   * This reads neither linked assets nor application-only state and admits no new vector editing.
   */
  inspectSource(): PsdSourceSnapshot;
  /**
   * Inspects native mode/depth and physical layer bounds/channel IDs without display conversion.
   * Source inspection alone does not admit an edit. Persistent IDs can be absent in arbitrary files;
   * editProcess validates unique nonzero IDs, complete native planes and every dependency separately.
   * Physical record order and bounds describe the current revision, including earlier transactions.
   */
  inspectProcess(): PsdProcessSource;
  /**
   * Copies the current serialized source and its revision for a checked container proposal.
   * Pending visual edits may leave stale caches in this snapshot. This performs no save preparation.
   * The bytes are independent of the session. Serialization and the full JS copy are unbudgeted.
   */
  sourceSnapshot(): PsdContainerSnapshot;
  /**
   * Changes the existing sole Surface Blur on one identity full-canvas embedded RGB8 PNG.
   * Requires an untagged positive-alpha source and one opaque Normal backdrop, up to 512 per axis.
   * Preserves content identity, PNG/link bytes, quads and source precision. A fresh canonical host
   * placementId updates SoLd and FEid together. Rebuilds FEid input, parent and real merged caches,
   * preserves the raw filter mask and removes stale thumbnails. Repeated edits use the original PNG.
   * Existing Normal/Multiply returns and enabled unlinked white-extended masks admit integer density
   * and feather 0, 0.5 or 2. linearBlending is required host gamma context; it is never inferred.
   * Unknown settings/dependencies, stacks, transformed/shared/external sources, zero alpha and
   * other modes/depths throw. Every failure preserves bytes and revision.
   */
  editSurfaceBlur(settings: PsdSurfaceBlurEdit, linear_blending: boolean): M01EditOutcome;
  /**
   * Renames primary lyid/luni-only raster records through a shared allocation context.
   * Requires unique IDs and no staged semantic state or pending visual work. Other carriers refuse.
   * The context baseline must include the current source, supplied fonts, batch strings and host copies.
   * Bounded serialization, reparse, name storage and final save complete before publishing one revision.
   * Failure preserves source/revision and retains account charges. Allocation/live refusals throw
   * PsdBudgetError and stay sticky across later calls using the same context. No visual edit is admitted.
   */
  renameInContext(batch: readonly PsdContextRename[], context: PsdAllocationContext): PsdPreparedSave;
  /**
   * Repaints the selected source slot of a sole unmasked, full-strength Normal RGB8 canvas SoCo.
   * recordIndex is the physical index from inspectSource, invalidated by structural edits.
   * color null regenerates the existing source; otherwise three integral RGB8 components are required.
   * Preserves nativeColor/userColor/Clr syntax and inactive values, rebuilding layer and merged caches
   * atomically and removing stale thumbnails. linearBlending is the explicit host gamma-1 operand.
   * Active non-RGB/HDR colors, non-sRGB profiles, shapes, styles, mirrors and multilayer scenes refuse.
   * Type errors and dependency refusals preserve source bytes, pending edits and revision.
   */
  repaintSolidFill(record_index: number, color: readonly [number, number, number] | null, linear_blending: boolean): M01EditOutcome;
  /**
   * Atomically changes bounded nonvisual metadata, including print captions and authored slice text.
   * Preserves pixels and unrelated carriers; guide edits regenerate both 1092 and 1032.
   * Active credentials, unknown versions, duplicate identities/carriers and other note encodings refuse.
   * printCaption coordinates existing 1083/1011 slots. sliceName admits existing authored v6/v7/v8
   * Unicode names; sliceUrl also coordinates its existing 1054/slic URL association without fetching it.
   * Names are at most 4096 UTF-16 units, URLs 65536; NUL, duplicate/missing carriers and automatic slices refuse.
   * captureCompVisibility recaptures every layer into an existing unique comp on coherent saved flat
   * unmasked RGB8 rasters. IDs, flags, state 0, other domains and current pixels/caches survive.
   * Pending visual/tree edits, masks, styles, type, smart layers and ambiguous state mappings refuse.
   * rasterResolution changes positive exact signed-16.16 ppi without resampling on plain RGB8 PSD rasters.
   * Requires no XMP; coordinates existing 1005, optional 1083/Rslt and one in-place EXIF companion.
   * Source units, unknown bytes and encoded pixels/previews survive. Unsupported companions and
   * text/smart/vector/style/mask/state dependencies refuse; pending visual edits retain strict preparation.
   * fileInfoCopyright admits publicDomain in canonical simple PS26 XMP/IIM/MD5/EXIF with explicit
   * saveContext timestamps and generated identities. Other copyright transitions, File Info titles,
   * scalar XMP intents, automatic slices and general comp/print/resolution dependencies refuse.
   * Pending visual changes still require a strict render on prepareSave. Failure preserves revision/bytes.
   */
  editStateMetadata(edits: readonly PsdStateMetadataEdit[]): M01EditOutcome;
  /**
   * Applies an existing visibility-only comp on coherent saved flat unmasked RGB8 rasters.
   * Preserves geometry, appearance and saved states, updates history and regenerates real merged pixels.
   * compId must be a positive persistent i32 identity; capture flags must be 1 or 17.
   * Requires unprofiled source, complete unique comp/state-0 mappings and explicit Boolean gamma.
   * Tracks, masks, child state, other capture domains and pending visual edits throw typed errors,
   * preserving bytes and revision. General applyComp and captureComp remain refused.
   */
  applyVisibilityComp(comp_id: number, linear_blending: boolean): M01EditOutcome;
  /**
   * Edits and repaints a sole Normal RGB8 Classic canvas GdFl, with all render-input caches removed.
   * Regenerates layer RGB/alpha and real merged caches atomically, omitting stale thumbnail 1036.
   * Empty patch repaints the current descriptor. DitheredGradient and UnsupportedGradientInterpolation
   * are named refusals. Active masks, shapes, styles, additional layers and other modes/depths refuse.
   */
  repaintGradientFill(record_index: number, patch: GradientFillPatch, linear_blending?: boolean | null): M01EditOutcome;
  /**
   * Changes existing version-2 Lab or version-3 XYZ settings in the bounded CMYK8/16 two-layer product.
   * recordIndex comes from inspectSource. Requires the measured embedded coated profile,
   * opaque raw source, full strength, absent/default white mask and relative/BPC-on/dither-off context.
   * Rebuilds native merged data and depth carriers before publishing; removes stale previews.
   * Other profiles, identity shortcuts, incompatible Lab/XYZ patches, unknown dependencies and unsupported
   * graphs throw named errors atomically. Omitted patch fields preserve their exact source values.
   */
  setCmykPhotoFilter(record_index: number, patch: PsdCmykPhotoFilterPatch, linear_blending: boolean): M01EditOutcome;
  /**
   * Requests Photoshop 26 complete save preparation with explicit host operands.
   * Requires every named context field and rejects extras. This research endpoint
   * returns Dependency at save.thumbnail.adobe-jpeg without changing the session.
   */
  preparePhotoshop26Save(context: any): PsdPreparedSave;
  /**
   * Prepares a research candidate for photoshop26.reopen-equivalent/v1.
   * Requires explicit save context and per-layer edit times. It supplies no
   * equivalence certificate or new edit admission. RGB8, measured sRGB profile,
   * opaque 72-ppi canvases fitting the native preview without resizing only.
   * Other cases throw a typed dependency and leave the session unchanged.
   */
  prepareReopenCandidate(context: any, layer_times: any): PsdPreparedSave;
  /**
   * Freezes the same strict save as prepareSave and records the consumed RGB blending operand.
   * Omission assumes encoded blending, false. A supplied Boolean records host input without verifying it.
   * Fonts, text gamma and profiles are not consumed by this operation. Existing save refusals propagate.
   */
  prepareSaveWithContext(linear_blending?: boolean | null): PsdContextualSave;
  /**
   * Checks a strict serialized proposal against baseRevision and atomically prepares its save.
   * Only canonical names, opacity, locks, labels and existing metadata copy flags are bridged.
   * Every other source byte must match an exact replay. Unaccounted changes throw Dependency;
   * stale revisions throw Invalid. Render, parse and save failures preserve source and revision.
   * linearBlending is the explicit host gamma-1 RGB operand. Use the returned frozen save bytes,
   * which may replace stale proposed caches. Inherited opening caches are not certified.
   */
  prepareContainerMutation(base_revision: bigint, proposed: Uint8Array, linear_blending: boolean): PsdMutationSave;
  /**
   * Repaints explicit Linear interpolation/style on a sole full-strength Normal RGB8 canvas GdFl.
   * Requires the admitted sampled sRGB profile and Dot Gain 20% working Gray; linearBlending is the
   * host gamma-1 preference, false by default. Empty patch regenerates without using source caches.
   * Preserves straight hidden RGB at zero alpha, rebuilds real merged data and removes stale thumbnails.
   * Other profiles, dither, shapes, masks, effects, extra layers and unknown inputs refuse atomically.
   */
  repaintLinearGradientFill(record_index: number, patch: LinearGradientFillPatch, linear_blending?: boolean | null): M01EditOutcome;
  /**
   * Replaces the embedded same-size positive-alpha PNG through one existing identity Surface Blur.
   * Keeps complete filter/blend/mask source state and rebuilds FEid, parent and real merged pixels.
   * Admits unprofiled RGB8, a full-canvas source up to 512 per axis, one opaque Normal backdrop,
   * one enabled valid filter, a Normal/Multiply return and an enabled unlinked white-extended mask.
   * Requires fresh distinct UUIDs and explicit Boolean gamma. Removes stale thumbnails on success.
   * Unknown/shared/linked dependencies throw typed errors, preserving source bytes and revision.
   */
  replaceSurfaceBlurContents(replacement: PsdSurfaceBlurContents, linear_blending: boolean): M01EditOutcome;
  /**
   * Repaints explicit Perceptual interpolation with Linear style on a sole full-strength Normal RGB8 canvas GdFl.
   * Requires the admitted sampled sRGB profile and Dot Gain 20% working Gray; linearBlending is the
   * host gamma-1 preference, false by default. Empty patch regenerates without using source caches.
   * Preserves straight hidden RGB at zero alpha, rebuilds real merged data and removes stale thumbnails.
   * Other profiles, dither, shapes, masks, effects, extra layers and unknown inputs refuse atomically.
   */
  repaintPerceptualGradientFill(record_index: number, patch: PerceptualGradientFillPatch, linear_blending?: boolean | null): M01EditOutcome;
  /**
   * Opens an in-memory PSD/PSB. Untouched save works for any container the lossless parser accepts.
   * This bounded API does not claim paged input or arbitrary-size PSB support.
   */
  constructor(bytes: Uint8Array);
  /**
   * Applies a M01Edit array atomically. Positions are bottom to top and moves count after removal.
   * New IDs are returned in insertion order. Group-end IDs cannot be targeted. Names must be control-free
   * and at most 255 UTF-16 units. Invalid values refuse,
   * preserving revision, tree and allocation floor. Clip/unclip must leave a preceding raster base.
   * replacePixels preserves properties and exact straight RGBA, including hidden RGB and off-canvas samples.
   * paintPixels replaces its rectangle exactly and extends bounds; it does not blend brush samples.
   * setMask creates/edits the independent raster source, or removes it with null. With a vector it edits -3
   * and rebuilds combined -2. Disabling a real source beside a vector refuses. Empty outside-white masks remain distinct from deletion.
   * setVectorMask creates/edits/removes one absolute rectangle/ellipse path, keeping raster source independent.
   * setSolid updates RGB8 SoCo and vector generator mirrors plus caches; shape null makes an unbounded fill.
   * Relative/inverted/feathered masks, strokes, live origination and general curves refuse.
   * Shape canvases are at most 2000x1000, coordinates within +/-2000.
   * Groups refuse pixel edits; malformed buffers/extents roll back the complete batch.
   */
  edit(batch: readonly M01Edit[]): M01EditOutcome;
  /**
   * Releases the source/model. Existing prepared saves remain independent. Further session calls throw.
   */
  dispose(): void;
  /**
   * Returns revision as bigint, native canvas dimensions and a stable bottom-to-top raster/group tree.
   * Inspection throws a typed refusal outside admission; untouched save remains available.
   * Dirty inspection checks saving with encoded RGB blending and can allocate a whole-canvas render.
   */
  inspect(): M01Snapshot;
  /**
   * Replaces text and optional uniform style in one atomic text-only transaction.
   * Register actual original/requested fonts and the whitespace-marker face with addTextFont first.
   * Supports bounded printable ASCII/CR in left horizontal Crisp point or left/center/right Single-line RGB8 boxes.
   * Fitting Every-line boxes admit terminal aliases with integral size and zero tracking.
   * Two alphabetic words separated by one space may wrap in left/center/right modes when conservative
   * margins force one break. Wrapped style mutations, competing/near-fit breaks and full justification refuse.
   * Center/right require integral font size and zero tracking; non-left point text refuses.
   * Full CFF edits refuse because actual-size ink bounds remain unresolved; planCffText is read-only.
   * Unsupported shaping, mixed styles, negative spacing, overflow and dependencies throw named errors.
   * Mixed raster/type batches remain refused. Font registration changes no revision or source bytes.
   */
  setText(layer_id: number, text: string, patch: PsdTextStylePatch | undefined): M01EditOutcome;
  /**
   * Application-local selection, independent of persisted comp capture flags and lastAppliedComp.
   */
  readonly selectedComp: number | undefined;
  /**
   * Current source revision, including documents outside tree-inspection admission.
   * Reading it performs no render or allocation-heavy source snapshot.
   */
  readonly revision: bigint;
}
/**
 * Frozen M01 in-memory save. Chunk reads bound each returned Uint8Array, not total WASM allocation.
 */
export class PsdPreparedSave {
  private constructor();
  free(): void;
  /**
   * Returns the next at-most-maxBytes chunk, or undefined at EOF. Accepts 1 through 16 MiB.
   * Bytes are available only after all save checks succeed. Throws after disposal.
   */
  nextChunk(max_bytes: number): Uint8Array | undefined;
  /**
   * Releases prepared bytes. Further chunk reads throw; repeated disposal is harmless.
   */
  dispose(): void;
  /**
   * Revision frozen by prepareSave, independent of later edits or session disposal.
   */
  readonly revision: bigint;
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

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_psdallocationcontext_free: (a: number, b: number) => void;
  readonly __wbg_psdeditorsession_free: (a: number, b: number) => void;
  readonly __wbg_psdpreparedsave_free: (a: number, b: number) => void;
  readonly __wbg_psdsourcehandle_free: (a: number, b: number) => void;
  readonly checkPhotoshop26Save: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly generatePhotoshop26Thumbnail: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
  readonly psdallocationcontext_new: (a: any) => [number, number, number];
  readonly psdallocationcontext_retainedBytes: (a: number) => bigint;
  readonly psdeditorsession_addTextFont: (a: number, b: number, c: number, d: number) => [number, number];
  readonly psdeditorsession_applyVisibilityComp: (a: number, b: any, c: any) => [number, number, number];
  readonly psdeditorsession_dispose: (a: number) => void;
  readonly psdeditorsession_edit: (a: number, b: any) => [number, number, number];
  readonly psdeditorsession_editCarriers: (a: number, b: any, c: any) => [number, number, number];
  readonly psdeditorsession_editChannels: (a: number, b: any) => [number, number, number];
  readonly psdeditorsession_editGeometry: (a: number, b: any, c: number) => [number, number, number];
  readonly psdeditorsession_editProcess: (a: number, b: any, c: any) => [number, number, number];
  readonly psdeditorsession_editRasterTreeExact: (a: number, b: any, c: number) => [number, number, number];
  readonly psdeditorsession_editSmart: (a: number, b: any, c: number) => [number, number, number];
  readonly psdeditorsession_editSource: (a: number, b: any) => [number, number, number];
  readonly psdeditorsession_editStateMetadata: (a: number, b: any) => [number, number, number];
  readonly psdeditorsession_editSurfaceBlur: (a: number, b: any, c: any) => [number, number, number];
  readonly psdeditorsession_inspect: (a: number) => [number, number, number];
  readonly psdeditorsession_inspectProcess: (a: number) => [number, number, number];
  readonly psdeditorsession_inspectSource: (a: number) => [number, number, number];
  readonly psdeditorsession_new: (a: number, b: number) => [number, number, number];
  readonly psdeditorsession_planCffText: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly psdeditorsession_prepareContainerMutation: (a: number, b: bigint, c: number, d: number, e: number) => [number, number, number];
  readonly psdeditorsession_preparePhotoshop26Save: (a: number, b: any) => [number, number, number];
  readonly psdeditorsession_prepareReopenCandidate: (a: number, b: any, c: any) => [number, number, number];
  readonly psdeditorsession_prepareSave: (a: number, b: number) => [number, number, number];
  readonly psdeditorsession_prepareSaveWithContext: (a: number, b: number) => [number, number, number];
  readonly psdeditorsession_renameInContext: (a: number, b: any, c: number) => [number, number, number];
  readonly psdeditorsession_repaintGradientFill: (a: number, b: number, c: any, d: number) => [number, number, number];
  readonly psdeditorsession_repaintLinearGradientFill: (a: number, b: number, c: any, d: number) => [number, number, number];
  readonly psdeditorsession_repaintPerceptualGradientFill: (a: number, b: number, c: any, d: number) => [number, number, number];
  readonly psdeditorsession_repaintSolidFill: (a: number, b: any, c: any, d: any) => [number, number, number];
  readonly psdeditorsession_replaceSurfaceBlurContents: (a: number, b: any, c: any) => [number, number, number];
  readonly psdeditorsession_revision: (a: number) => [bigint, number, number];
  readonly psdeditorsession_selectComp: (a: number, b: number, c: number) => [number, number];
  readonly psdeditorsession_selectedComp: (a: number) => [number, number, number];
  readonly psdeditorsession_setCmykPhotoFilter: (a: number, b: any, c: any, d: any) => [number, number, number];
  readonly psdeditorsession_setText: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
  readonly psdeditorsession_sourceSnapshot: (a: number) => [number, number, number];
  readonly psdpreparedsave_dispose: (a: number) => void;
  readonly psdpreparedsave_nextChunk: (a: number, b: number) => [number, number, number, number];
  readonly psdpreparedsave_revision: (a: number) => bigint;
  readonly psdsourcehandle_info: (a: number) => [number, number, number];
  readonly psdsourcehandle_open: (a: any, b: bigint, c: any) => [number, number, number];
  readonly psdsourcehandle_readGrid: (a: number, b: bigint, c: bigint, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: any) => [number, number, number, number];
  readonly psdsourcehandle_writeUnchanged: (a: number, b: any, c: any) => [number, number];
  readonly rasterizeCff2Strong: (a: number, b: number, c: any, d: any, e: number, f: number, g: number) => [number, number, number];
  readonly readPsd: (a: number, b: number) => [number, number, number];
  readonly readPsdMetadataQueries: (a: number, b: number) => [number, number, number];
  readonly readPsdSource: (a: number, b: number) => [number, number, number];
  readonly writePsd: (a: any, b: number, c: number) => [number, number, number, number];
  readonly writeSavedHistory: (a: number, b: number, c: any, d: number, e: number) => [number, number, number, number];
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
