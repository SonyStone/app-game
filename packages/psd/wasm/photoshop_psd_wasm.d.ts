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
 * Reads persisted source styles, locks, labels, metadata envelopes and XMP without renderer projection.
 * Optional fields are null when absent or differently tagged. Unknown descriptor leaves stay in sourceBlock.
 * Physical record indices refer to the selected layer-info section and change after structural edits.
 */
export function readPsdSource(bytes: Uint8Array): PsdSourceSnapshot;

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



/** Per-call host policy. Defaults are 64 MiB per allocation, 512 MiB live and depth 64.
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
  | { readonly kind: 'setProcessOpacity'; readonly layerId: number; /** Integral native byte. */ readonly opacity: number }
  | { readonly kind: 'renameProcessLayer'; readonly layerId: number; /** Control-free valid Unicode, at most 255 UTF-16 units. */ readonly name: string };
/** Existing version-2 Lab CMYK Photo Filter settings. Unsupported products refuse before publishing. */
export interface PsdCmykPhotoFilterPatch {
  /** Integral 1..100; omission preserves source. */ readonly density?: number;
  /** Encoded u16 Lab words, L in hundredths and signed a/b in hundredths represented as u16. */
  readonly lab?: readonly [number, number, number];
  /** Preserve CMY luminance and source K; omission preserves source. */ readonly preserveLuminosity?: boolean;
}
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
  /** Named refusals until complete dependent writers have native acceptance. */
  | { readonly kind: 'applyComp' | 'captureComp' | 'slices' | 'xmp' | 'printOptions' | 'resolution' };

/** Linear interpolation/style only, with sampled sRGB and Dot Gain 20%. Other context refuses atomically. */
export type LinearGradientFillPatch = Omit<GradientFillPatch, 'style'> & { readonly style?: 'linear' };
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
      /** Required host preference. Bilinear retains at least half of each source axis. */
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
/** Snapshot of the admitted RGB8 identity tree. Scalars use byte opacity/Fill. */
export interface M01Snapshot { readonly revision: bigint; readonly width: number; readonly height: number; readonly identityFloor: number; readonly saveBlocked: boolean; readonly selected: readonly number[]; readonly layers: readonly M01Layer[]; }
/** Group children are bottom-to-top; endId is reserved and cannot be edited. */
export interface M01Layer { readonly id: number; readonly endId: number | null; readonly name: string; readonly visible: boolean; readonly opacity: number; readonly fill: number; readonly blend: string; readonly clipped: boolean; readonly link: number | null; readonly linkEnabled: boolean | null; readonly children: readonly M01Layer[]; }
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
  /** Uniform paragraph alignment. Full justification refuses; center/right require an integral size and zero tracking in a Single-line box. */
  readonly justification?: 'left' | 'center' | 'right';
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
  | { /** Named refusal until parameters, paths and caches agree. */ kind: 'editLiveShape' }
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
   * Bilinear retains at least half of each source axis; cubic scaling requires unavailable table state.
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
   * Resizes a root artboard or translates one admitted raster subtree on a fixed canvas.
   * RGB8 PSD only, canvas at most 2000x1000, coordinates within +/-2000, with auto-expand/shrinkwrap off.
   * Rebuilds merged RGB/alpha strictly and omits stale previews before publishing the revision.
   * Move translates an admitted raster subtree; create, live-parameter edits and frame replacement refuse.
   * Failure preserves bytes and revision. linearBlending is the host gamma-1 preference, false by default.
   */
  editGeometry(edit: PsdGeometryEdit, linear_blending?: boolean | null): M01EditOutcome;
  /**
   * Builds a read-only CFF1 layout plan using fonts registered with addTextFont.
   * Admits unchanged size/font at size/unitsPerEm = 1/16, printable ASCII/CR, left Crisp point
   * or Single-line boxes, zero tracking/baseline and exact source raster regeneration.
   * Shaping, soft wrapping, negative extents and other dependencies throw. Revision and bytes stay intact.
   * Omits unresolved actual-size ink bounds. This plan cannot be committed by setText or prepareSave.
   */
  planCffText(layer_id: number, text: string): PsdCffLayoutCachePlan;
  /**
   * Inspects full-precision persisted source fields for any parsed container, without RGB8 tree admission.
   * Null leaves remain absent. This reads neither linked assets nor application-only state.
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
   * Atomically changes bounded nonvisual metadata, including print captions and authored slice text.
   * Preserves pixels and unrelated carriers; guide edits regenerate both 1092 and 1032.
   * Active credentials, unknown versions, duplicate identities/carriers and other note encodings refuse.
   * printCaption coordinates existing 1083/1011 slots. sliceName admits existing authored v6/v7/v8
   * Unicode names; sliceUrl also coordinates its existing 1054/slic URL association without fetching it.
   * Names are at most 4096 UTF-16 units, URLs 65536; NUL, duplicate/missing carriers and automatic slices refuse.
   * Comp application/capture, slice partitions, general print/resolution and XMP throw named Dependency errors.
   * Pending visual changes still require a strict render on prepareSave. Failure preserves revision/bytes.
   */
  editStateMetadata(edits: readonly PsdStateMetadataEdit[]): M01EditOutcome;
  /**
   * Edits and repaints a sole Normal RGB8 Classic canvas GdFl, with all render-input caches removed.
   * Regenerates layer RGB/alpha and real merged caches atomically, omitting stale thumbnail 1036.
   * Empty patch repaints the current descriptor. DitheredGradient and UnsupportedGradientInterpolation
   * are named refusals. Active masks, shapes, styles, additional layers and other modes/depths refuse.
   */
  repaintGradientFill(record_index: number, patch: GradientFillPatch, linear_blending?: boolean | null): M01EditOutcome;
  /**
   * Changes existing version-2 Lab Photo Filter settings in the bounded CMYK8/16 two-layer product.
   * recordIndex comes from inspectSource. Requires the measured embedded coated profile,
   * opaque raw source, full strength, absent/default white mask and relative/BPC-on/dither-off context.
   * Rebuilds native merged data and depth carriers before publishing; removes stale previews.
   * Other profiles, identity shortcuts, version-3 colors, unknown dependencies and unsupported
   * graphs throw named errors atomically. Omitted patch fields preserve their exact source values.
   */
  setCmykPhotoFilter(record_index: number, patch: PsdCmykPhotoFilterPatch, linear_blending: boolean): M01EditOutcome;
  /**
   * Repaints explicit Linear interpolation/style on a sole full-strength Normal RGB8 canvas GdFl.
   * Requires the admitted sampled sRGB profile and Dot Gain 20% working Gray; linearBlending is the
   * host gamma-1 preference, false by default. Empty patch regenerates without using source caches.
   * Preserves straight hidden RGB at zero alpha, rebuilds real merged data and removes stale thumbnails.
   * Other profiles, dither, shapes, masks, effects, extra layers and unknown inputs refuse atomically.
   */
  repaintLinearGradientFill(record_index: number, patch: LinearGradientFillPatch, linear_blending?: boolean | null): M01EditOutcome;
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
   * Center/right require integral font size and zero tracking; full justification and non-left point text refuse.
   * Full CFF edits refuse because actual-size ink bounds remain unresolved; planCffText is read-only.
   * Unsupported shaping, mixed styles, negative spacing, overflow and dependencies throw named errors.
   * Mixed raster/type batches remain refused. Font registration changes no revision or source bytes.
   */
  setText(layer_id: number, text: string, patch: PsdTextStylePatch | undefined): M01EditOutcome;
  /**
   * Application-local selection, independent of persisted comp capture flags and lastAppliedComp.
   */
  readonly selectedComp: number | undefined;
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
  readonly __wbg_psdeditorsession_free: (a: number, b: number) => void;
  readonly __wbg_psdpreparedsave_free: (a: number, b: number) => void;
  readonly __wbg_psdsourcehandle_free: (a: number, b: number) => void;
  readonly psdeditorsession_addTextFont: (a: number, b: number, c: number, d: number) => [number, number];
  readonly psdeditorsession_dispose: (a: number) => void;
  readonly psdeditorsession_edit: (a: number, b: any) => [number, number, number];
  readonly psdeditorsession_editChannels: (a: number, b: any) => [number, number, number];
  readonly psdeditorsession_editGeometry: (a: number, b: any, c: number) => [number, number, number];
  readonly psdeditorsession_editProcess: (a: number, b: any, c: any) => [number, number, number];
  readonly psdeditorsession_editSmart: (a: number, b: any, c: number) => [number, number, number];
  readonly psdeditorsession_editSource: (a: number, b: any) => [number, number, number];
  readonly psdeditorsession_editStateMetadata: (a: number, b: any) => [number, number, number];
  readonly psdeditorsession_inspect: (a: number) => [number, number, number];
  readonly psdeditorsession_inspectProcess: (a: number) => [number, number, number];
  readonly psdeditorsession_inspectSource: (a: number) => [number, number, number];
  readonly psdeditorsession_new: (a: number, b: number) => [number, number, number];
  readonly psdeditorsession_planCffText: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly psdeditorsession_prepareSave: (a: number, b: number) => [number, number, number];
  readonly psdeditorsession_repaintGradientFill: (a: number, b: number, c: any, d: number) => [number, number, number];
  readonly psdeditorsession_repaintLinearGradientFill: (a: number, b: number, c: any, d: number) => [number, number, number];
  readonly psdeditorsession_selectComp: (a: number, b: number, c: number) => [number, number];
  readonly psdeditorsession_selectedComp: (a: number) => [number, number, number];
  readonly psdeditorsession_setCmykPhotoFilter: (a: number, b: any, c: any, d: any) => [number, number, number];
  readonly psdeditorsession_setText: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
  readonly psdpreparedsave_dispose: (a: number) => void;
  readonly psdpreparedsave_nextChunk: (a: number, b: number) => [number, number, number, number];
  readonly psdpreparedsave_revision: (a: number) => bigint;
  readonly psdsourcehandle_info: (a: number) => [number, number, number];
  readonly psdsourcehandle_open: (a: any, b: bigint, c: any) => [number, number, number];
  readonly psdsourcehandle_readGrid: (a: number, b: bigint, c: bigint, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: any) => [number, number, number, number];
  readonly psdsourcehandle_writeUnchanged: (a: number, b: any, c: any) => [number, number];
  readonly rasterizeCff2Strong: (a: number, b: number, c: any, d: any, e: number, f: number, g: number) => [number, number, number];
  readonly readPsd: (a: number, b: number) => [number, number, number];
  readonly readPsdSource: (a: number, b: number) => [number, number, number];
  readonly writePsd: (a: any, b: number, c: number) => [number, number, number, number];
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
