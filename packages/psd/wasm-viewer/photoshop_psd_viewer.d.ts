/* tslint:disable */
/* eslint-disable */
/**
 * Reads the raster layers of an RGB, Grayscale or Bitmap PSD or PSB at any depth, groups flattened.
 */
export function readPsd(bytes: Uint8Array): any;
/**
 * Writes an 8-bit RGB document of `document.layers` and the straight RGBA `composite`; PSB above 30000
 * pixels on a side.
 */
export function writePsd(document: any, composite: Uint8Array): Uint8Array;

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


/**
 * An open document: its parsed container and each layer record's saved visibility.
 */
export class PsdDocumentHandle {
  private constructor();
  free(): void;
  /**
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
   */
  savedOverview(step: number, max_work_pixels: number): PsdRegionPixels;
  /**
   * Exact integer decimation of a fresh layer render. Output pixel `(x,y)` samples document
   * pixel `(x*step,y*step)`, without filtering or scaling operation parameters. Dimensions are
   * `ceil(documentWidth/step)` by `ceil(documentHeight/step)`. `step` must be positive.
   * Returns `PsdRegionPixels`; options, visibility, state and fonts match `renderRegion`.
   * Rendering sampled scanlines bounds canvas storage but may be slower than a whole render.
   */
  renderOverview(step: number, options: any, fonts: PsdFontLibrary): PsdRegionPixels;
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
   * Photoshop's saved merged image ("Maximize Compatibility") as straight 8-bit RGBA, unmatted from white where it
   * carries transparency and converted from 16 and 32 bits like the composite. Throws `PsdUnsupportedError` when
   * the file has none or its color mode is not rendered.
   */
  merged(): any;
  /**
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
   * Conflicts throw in strict mode. In `approximate`, supported global-style cmap or coherent descender
   * conflicts select ordinary document mixing and retain the cached raster and CachedRaster diagnostic.
   * Other imports stay unresolved and keep their existing mixing and reporting.
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
   * retaining the cached raster and CachedRaster diagnostic. Strict rendering still refuses these conflicts.
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
  readonly __wbg_renderedimage_free: (a: number, b: number) => void;
  readonly psddocumenthandle_difference: (a: number, b: number) => [number, number, number];
  readonly psddocumenthandle_documentFonts: (a: number, b: number) => any;
  readonly psddocumenthandle_info: (a: number) => any;
  readonly psddocumenthandle_layerDetail: (a: number, b: number) => [number, number, number];
  readonly psddocumenthandle_layerPixels: (a: number, b: number) => [number, number, number];
  readonly psddocumenthandle_layers: (a: number) => [number, number, number];
  readonly psddocumenthandle_merged: (a: number) => [number, number, number];
  readonly psddocumenthandle_open: (a: number, b: number) => [number, number, number];
  readonly psddocumenthandle_openLikePhotoshop: (a: number, b: number, c: any) => [number, number, number];
  readonly psddocumenthandle_render: (a: number, b: any, c: number) => [number, number, number];
  readonly psddocumenthandle_renderOverview: (a: number, b: number, c: any, d: number) => [number, number, number];
  readonly psddocumenthandle_renderRegion: (a: number, b: number, c: number, d: number, e: number, f: any, g: number) => [number, number, number];
  readonly psddocumenthandle_renderRegions: (a: number, b: any, c: any, d: number) => [number, number, number];
  readonly psddocumenthandle_savedOverview: (a: number, b: number, c: number) => [number, number, number];
  readonly psddocumenthandle_states: (a: number) => any;
  readonly psddocumenthandle_textSupport: (a: number, b: number, c: number) => [number, number, number];
  readonly psdfontlibrary_add: (a: number, b: number, c: number) => [number, number, number];
  readonly psdfontlibrary_addActiveFace: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
  readonly psdfontlibrary_fonts: (a: number) => any;
  readonly psdfontlibrary_new: () => number;
  readonly psdfontlibrary_setHyphenationDictionary: (a: number, b: number, c: number) => [number, number];
  readonly readPsd: (a: number, b: number) => [number, number, number];
  readonly renderedimage_approximations: (a: number) => any;
  readonly renderedimage_depth: (a: number) => number;
  readonly renderedimage_height: (a: number) => number;
  readonly renderedimage_rgba8: (a: number) => any;
  readonly renderedimage_width: (a: number) => number;
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
