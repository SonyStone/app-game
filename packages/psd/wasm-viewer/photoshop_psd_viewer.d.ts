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
/**
 * An open document: its parsed container and each layer record's saved visibility.
 */
export class PsdDocumentHandle {
  private constructor();
  free(): void;
  /**
   * Parses a PSD or PSB file. Fails only when the header or an outer section is unusable; damaged inner
   * structures stay readable as far as they parse.
   */
  static open(bytes: Uint8Array): PsdDocumentHandle;
  /**
   * Size, depth, color mode, channels, format, image resources, document-level tagged blocks and the merged
   * image's layout.
   */
  info(): any;
  /**
   * The layer tree, bottom to top as stored: groups hold their children, also bottom to top. Each node carries
   * the summary a layers panel shows and `notes` on what the compositor leaves out or approximates. Fails when
   * group markers do not nest.
   */
  layers(): any;
  /**
   * Everything known about layer record `index`: properties, mask, vector mask, effects with their settings,
   * adjustment settings, text, smart-object placement and contents, and the raw tagged blocks.
   */
  layerDetail(index: number): any;
  /**
   * The layer's own color and transparency as straight 8-bit RGBA (`left`, `top`, `width`, `height`, `pixels`),
   * converted from the document's depth with the crate's verified conversions, without masks or effects, and its
   * mask channels (`masks`: user mask `-2` and real raster mask `-3`) as 8-bit planes with their rectangles.
   */
  layerPixels(index: number): any;
  /**
   * Composites the document with `options` (see [`RenderSettings::read`]): 8-bit RGB and Grayscale with
   * `composite_with_report`, 16- and 32-bit with `composite_deep`, CMYK and Lab of 8 and 16 bits in their own
   * channels with `composite_channels` whether or not `approximate` is set (shown through the approximate
   * conversion to sRGB, which the render's `approximations` report), Bitmap from its flattened image. With
   * `approximate`, what those refuse renders through `composite_with_report` instead: RGB and Grayscale documents
   * leniently, 16- and 32-bit ones at 8 bits, the other color modes and the CMYK and Lab documents
   * `composite_channels` rejects with their layers converted to sRGB, each approximation listed in the render's
   * `approximations`. With `typeLayers`, type layers are re-rendered from their text with the fonts of `fonts`
   * (`CompositeOptions::type_layers`): a type layer the crate does not re-render exactly, or whose font `fonts` lacks,
   * fails the render, or with `approximate` composites its cached raster and is listed. Without `typeLayers`,
   * `fonts` is not read. Visibility overrides apply to this render only. Throws `PsdUnsupportedError` naming the
   * first setting the compositor does not reproduce.
   */
  render(options: any, fonts: PsdFontLibrary): RenderedImage;
  /**
   * The fonts the document's type layers use, by the PostScript names their style runs select from the layer's
   * `FontSet` (unused `FontSet` defaults such as `AdobeInvisFont` are left out), sorted by name, each with whether
   * `fonts` holds it and the record indices of the type layers using it (`fonts`), and per type layer record, bottom
   * to top, its name, visibility as saved and fonts, or `error` when its text cannot be read (`layers`).
   */
  documentFonts(fonts: PsdFontLibrary): any;
  /**
   * Whether type layer record `index` re-renders from its text with `fonts` as the compositor would with
   * `typeLayers` (`supported`, else the crate's `reason`), with the fonts it uses (`fonts`) and those `fonts` lacks
   * (`missing`); `null` for other records. 8-bit documents are checked with `render_rgba8`, 16- and 32-bit RGB and
   * Grayscale ones with `render_saved`; the compositor can still refuse the layer's blending at those depths. The
   * layer is re-rendered once to decide, which takes as long as compositing it.
   */
  textSupport(index: number, fonts: PsdFontLibrary): any;
  /**
   * Photoshop's saved merged image ("Maximize Compatibility") as straight 8-bit RGBA, unmatted from white where it
   * carries transparency and converted from 16 and 32 bits like the composite. Throws `PsdUnsupportedError` when
   * the file has none or its color mode is not rendered.
   */
  merged(): any;
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
}
/**
 * Fonts the caller supplies for re-rendering type layers, by PostScript name; nothing is loaded from the system. One
 * library serves any number of documents: [`DocumentHandle::render`], [`DocumentHandle::document_fonts`] and
 * [`DocumentHandle::text_support`] take it by reference. Fonts share their bytes, so a render copies none.
 */
export class PsdFontLibrary {
  free(): void;
  /**
   * An empty library.
   */
  constructor();
  /**
   * Adds a TrueType (`glyf`) or OpenType CFF font file under its PostScript name (`name` ID 6), replacing a font of
   * the same name, and returns its entry as [`Self::fonts`] lists it. Throws `PsdUnsupportedError` for font
   * collections (`.ttc`, `.otc`), WOFF files and fonts without a PostScript name or with outlines the crate does not
   * read, and `PsdError` for bytes that are not a readable font.
   */
  add(bytes: Uint8Array): any;
  /**
   * The fonts added, sorted by PostScript name: `name`, `format` (`TrueType` or `CFF`) and `size` in bytes.
   */
  fonts(): Array<any>;
  /**
   * Supplies Photoshop 26.0.0's `hyph_en_US.dic`, which hyphenated paragraph text needs; the crate verifies its
   * SHA-256 and throws `PsdUnsupportedError` for other dictionaries.
   */
  setHyphenationDictionary(bytes: Uint8Array): void;
}
/**
 * One composite: straight 8-bit RGBA for display and, for 16- and 32-bit documents, the composite at their depth, or
 * for CMYK and Lab documents the composite in their own channels.
 */
export class RenderedImage {
  private constructor();
  free(): void;
  /**
   * The composite as straight 8-bit RGBA, row by row: a fresh copy each call. 16-bit samples convert with
   * `R(q·255, 32768)`, 32-bit color with Photoshop's Exposure and Gamma toning at its defaults and alpha with
   * `⌊255a + ½⌋`; CMYK and Lab composites convert to sRGB through the approximate color management the
   * approximations name.
   */
  rgba8(): Uint8Array;
  /**
   * The documented approximations the render made, in words: the display conversion of a CMYK or Lab composite
   * made exactly in its channels, or what `approximate` allowed; empty when the render followed the exact path to
   * its display.
   */
  approximations(): Array<any>;
  /**
   * Width in pixels.
   */
  readonly width: number;
  /**
   * Height in pixels.
   */
  readonly height: number;
  /**
   * The depth the composite was computed at: 8, 16 or 32.
   */
  readonly depth: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_psddocumenthandle_free: (a: number, b: number) => void;
  readonly psddocumenthandle_open: (a: number, b: number) => [number, number, number];
  readonly psddocumenthandle_info: (a: number) => any;
  readonly psddocumenthandle_layers: (a: number) => [number, number, number];
  readonly psddocumenthandle_layerDetail: (a: number, b: number) => [number, number, number];
  readonly psddocumenthandle_layerPixels: (a: number, b: number) => [number, number, number];
  readonly psddocumenthandle_render: (a: number, b: any, c: number) => [number, number, number];
  readonly psddocumenthandle_documentFonts: (a: number, b: number) => any;
  readonly psddocumenthandle_textSupport: (a: number, b: number, c: number) => [number, number, number];
  readonly psddocumenthandle_merged: (a: number) => [number, number, number];
  readonly psddocumenthandle_difference: (a: number, b: number) => [number, number, number];
  readonly __wbg_psdfontlibrary_free: (a: number, b: number) => void;
  readonly psdfontlibrary_new: () => number;
  readonly psdfontlibrary_add: (a: number, b: number, c: number) => [number, number, number];
  readonly psdfontlibrary_fonts: (a: number) => any;
  readonly psdfontlibrary_setHyphenationDictionary: (a: number, b: number, c: number) => [number, number];
  readonly __wbg_renderedimage_free: (a: number, b: number) => void;
  readonly renderedimage_width: (a: number) => number;
  readonly renderedimage_height: (a: number) => number;
  readonly renderedimage_depth: (a: number) => number;
  readonly renderedimage_rgba8: (a: number) => any;
  readonly renderedimage_approximations: (a: number) => any;
  readonly readPsd: (a: number, b: number) => [number, number, number];
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
