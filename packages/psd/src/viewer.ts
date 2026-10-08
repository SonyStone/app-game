// Photoshop documents opened for viewing: structure, Photoshop-exact rendering and comparison with the merged image
// Photoshop saved, by the viewer module built in photoshop-analysis/psd-wasm with its `viewer` feature. Paint's flat
// codec (`readPsd`, `writePsd` in ./index) stays in its own, much smaller module.
import type {
  PsdFontLibrary as FontLibraryHandle,
  PsdDocumentHandle,
  RenderedImage
} from '../wasm-viewer/photoshop_psd_viewer.js';

/**
 * Opens a PSD or PSB for viewing, loading the viewer module on first use. The document keeps the parsed file in
 * WebAssembly memory until {@link PsdViewerDocument.close}. Files that are not Photoshop documents, or whose header or
 * outer sections are unusable, fail with `kind: 'invalid'`; damaged inner structures stay readable.
 */
export async function openPsd(bytes: Uint8Array | ArrayBuffer): Promise<PsdResult<PsdViewerDocument>> {
  const codec = await loadPsdViewer();
  const opened = attempt(() => codec.PsdDocumentHandle.open(asBytes(bytes)));
  if (!opened.ok) {
    return opened;
  }

  const handle = opened.value;
  const layers = attempt(() => handle.layers() as PsdLayerNode[]);
  if (!layers.ok) {
    handle.free();
    return layers;
  }

  return { ok: true, value: makeViewerDocument(codec, handle, handle.info() as PsdInfo, layers.value) };
}

/**
 * Creates an empty font library for re-rendering type layers from their text, loading the viewer module on first use.
 * Fonts come only from the caller: nothing is loaded from the system. One library serves any number of documents.
 */
export async function createFontLibrary(): Promise<PsdFontLibrary> {
  const codec = await loadPsdViewer();
  const handle = new codec.PsdFontLibrary();
  let open = true;
  const library: PsdFontLibrary = {
    add(bytes) {
      return open ? attempt(() => handle.add(asBytes(bytes)) as PsdFontInfo) : closedFailure();
    },
    fonts() {
      return open ? (handle.fonts() as PsdFontInfo[]) : [];
    },
    setHyphenationDictionary(bytes) {
      return open ? attempt(() => handle.setHyphenationDictionary(asBytes(bytes))) : closedFailure();
    },
    free() {
      if (open) {
        open = false;
        libraryHandles.delete(library);
        handle.free();
      }
    }
  };
  libraryHandles.set(library, handle);
  return library;
}

/** A value, or the reason it could not be produced. */
export type PsdResult<T> = { ok: true; value: T } | { ok: false; error: PsdFailure };

/**
 * Why an operation failed: `unsupported` when the renderer meets a setting it does not reproduce exactly (the message
 * names it, for example `layer "Logo": a non-parallelogram smart-object quad`), `invalid` for unreadable input.
 */
export type PsdFailure = { kind: 'unsupported' | 'invalid'; message: string };

/** An open document. Every call is synchronous; run it in a worker for large files. */
export type PsdViewerDocument = {
  /** Header, resources, document-level blocks and the merged image's layout. */
  readonly info: PsdInfo;
  /** The layer tree, bottom to top as stored; group children are bottom to top as well. */
  readonly layers: readonly PsdLayerNode[];
  /**
   * Composites the document at its depth with `settings`. `visibility` overrides the saved visibility of layer
   * records by index for this render only. With {@link PsdRenderSettings.typeLayers}, type layers re-render from their
   * text with `fonts` (none when omitted). The render keeps its full-depth composite for {@link difference} until
   * disposed or the document closes.
   */
  render(
    settings: PsdRenderSettings,
    visibility?: Iterable<readonly [number, boolean]>,
    fonts?: PsdFontLibrary
  ): PsdResult<PsdRender>;
  /** The fonts the document's type layers use and whether `fonts` holds each (none when omitted). */
  fonts(fonts?: PsdFontLibrary): PsdResult<PsdDocumentFonts>;
  /**
   * Whether type layer record `index` re-renders from its text with `fonts`, re-rendering it once to decide; `null`
   * for other records.
   */
  textSupport(index: number, fonts?: PsdFontLibrary): PsdResult<PsdTextSupport | null>;
  /**
   * Photoshop's saved merged image as straight 8-bit RGBA, other color modes than RGB and Grayscale converted to sRGB
   * as renders are; `unsupported` when the file has none.
   */
  merged(): PsdResult<PsdImage>;
  /** Compares a live render of this document with the merged image as Photoshop stores it. */
  difference(render: PsdRender): PsdResult<PsdDifference>;
  /** Everything known about one layer record. */
  layerDetail(index: number): PsdResult<PsdLayerDetail>;
  /** One layer's own pixels and mask channels at 8 bits. */
  layerPixels(index: number): PsdResult<PsdLayerPixels>;
  /** Frees the document and its renders. Later calls fail. */
  close(): void;
};

/**
 * Photoshop's rendering preferences, which documents do not record. New options are added as optional fields, which
 * older viewer modules ignore.
 */
export type PsdRenderSettings = {
  /** Color Settings' "Blend RGB Colors Using Gamma 1.0": mix coverage in linear light. Off by default. */
  linearBlending: boolean;
  /** "Blend Text Colors Using Gamma", 1.45 by default; `null` when off. */
  textGamma: number | null;
  /** Rasterize vector masks and supported shapes from their paths instead of Photoshop's cached rasters. */
  vectorPaths: boolean;
  /**
   * Re-render smart objects from their contents with this "Image Interpolation" preference; `null` keeps the
   * rasters Photoshop cached in the layers, which reproduces unchanged files.
   */
  smartObjects: PsdInterpolation | null;
  /**
   * Render what the exact path rejects with documented approximations instead of failing. RGB and Grayscale
   * documents render leniently: each refused setting is left out or substituted (unrendered effects and blend-if left
   * out, unreconstructed adjustments as identity adjustments, Dissolve with a stand-in noise, Gradient Map dither
   * undithered, wide feathers with the small-radius kernel, failed re-renders from cached rasters), and 16- and 32-bit
   * documents the depth compositor refuses composite at 8 bits. Indexed, Duotone and Multichannel documents, and CMYK
   * and Lab documents whose layers the channel compositor rejects, composite with every layer converted to sRGB
   * first. Documents the exact path renders render identically with this option. Each render lists what it
   * approximated in {@link PsdRender.approximations}, including the display conversion of CMYK and Lab. Off by
   * default.
   */
  approximate: boolean;
  /**
   * Re-render type layers from their text with the render's fonts instead of the rasters Photoshop cached in them, for
   * documents whose text was edited. Exact where the crate's research verifies Photoshop's text rendering; a type layer
   * it does not reproduce, or whose font is missing, fails the render naming the reason, or with `approximate`
   * composites its cached raster and is listed among the approximations. Off by default.
   */
  typeLayers: boolean;
};

/** Photoshop's "Image Interpolation" preferences. */
export type PsdInterpolation =
  | 'nearestNeighbor'
  | 'bilinear'
  | 'bicubic'
  | 'bicubicSmoother'
  | 'bicubicSharper'
  | 'bicubicAutomatic';

/**
 * Photoshop 26's defaults: gamma 1.0 blending off, text gamma 1.45 on, cached vector and smart-object rasters; exact
 * rendering only.
 */
export const photoshopDefaultSettings: PsdRenderSettings = {
  linearBlending: false,
  textGamma: 1.45,
  vectorPaths: false,
  smartObjects: null,
  approximate: false,
  typeLayers: false
};

/**
 * Fonts supplied for re-rendering type layers, by PostScript name. Adding a font of a name already present replaces
 * it. Every call is synchronous.
 */
export type PsdFontLibrary = {
  /**
   * Adds a TrueType or OpenType CFF font file (`.ttf`, `.otf`) under its PostScript name. Font collections (`.ttc`),
   * WOFF files, fonts without a PostScript name and outlines the renderer does not read fail as `unsupported`, other
   * bytes as `invalid`.
   */
  add(bytes: Uint8Array | ArrayBuffer): PsdResult<PsdFontInfo>;
  /** The fonts added, sorted by PostScript name. */
  fonts(): PsdFontInfo[];
  /**
   * Supplies Photoshop 26.0.0's `hyph_en_US.dic`, which hyphenated paragraph text needs; other dictionaries fail as
   * `unsupported`.
   */
  setHyphenationDictionary(bytes: Uint8Array | ArrayBuffer): PsdResult<void>;
  /** Frees the library. Later calls fail; documents rendered with it are unaffected. */
  free(): void;
};

/** A font in a {@link PsdFontLibrary}: its PostScript name, outline format and file size in bytes. */
export type PsdFontInfo = { name: string; format: 'TrueType' | 'CFF'; size: number };

/**
 * The fonts a document's type layers use: the PostScript names their style runs select (unused `FontSet` defaults
 * such as `AdobeInvisFont` are left out), sorted by name, with whether the library holds each and the type layer
 * records using it; and the type layer records bottom to top with their fonts, or the error reading their text.
 */
export type PsdDocumentFonts = {
  fonts: { name: string; available: boolean; layers: number[] }[];
  layers: { index: number; name: string; visible: boolean; fonts: string[]; error?: string }[];
};

/**
 * Whether a type layer re-renders from its text with a library, as {@link PsdRenderSettings.typeLayers} would render
 * it: `reason` is the renderer's refusal when not, such as a missing font or an unverified setting. 16- and 32-bit
 * compositors can still refuse the layer's blending.
 */
export type PsdTextSupport = { fonts: string[]; missing: string[]; supported: boolean; reason?: string };

/** Straight (not premultiplied) 8-bit RGBA, row by row. */
export type PsdImage = { width: number; height: number; pixels: Uint8Array };

/** A composite: 8-bit RGBA for display, its depth, and how long compositing took. */
export type PsdRender = PsdImage & {
  /**
   * The depth the compositor worked at; 16- and 32-bit composites, and CMYK and Lab composites made in their own
   * channels, are converted for `pixels`.
   */
  depth: 8 | 16 | 32;
  /** Compositing time in milliseconds, without the copy out of WebAssembly memory. */
  milliseconds: number;
  /**
   * What this render approximated, in words, one entry each: the conversion to sRGB of a CMYK or Lab composite made
   * exactly in its channels, or what `approximate` allowed (a color-mode conversion, a reduction to 8 bits, and each
   * layer setting left out or substituted, as `“layer”: setting — what was done`); empty for exact renders.
   */
  approximations: string[];
  /** Frees the full-depth composite kept for comparisons; `pixels` stay usable. */
  dispose(): void;
};

/**
 * A render compared with Photoshop's merged image. `pixels` is a heat map: matching pixels as a dimmed gray of the
 * render, differing ones from yellow (one unit) through red to magenta on a logarithmic scale.
 */
export type PsdDifference = PsdImage & {
  /**
   * What a difference counts: 8-bit levels, 16-bit wire levels or float32 units in the last place, as Photoshop stores
   * the merged image. CMYK and Lab composites made in their own channels count levels of those channels, compared
   * channel by channel with the merged image as stored (`CMYK level`, `16-bit Lab level`, …). `sRGB level` is for
   * approximate color modes, compared with the merged image converted to sRGB the same way, and `8-bit level` for
   * approximate renders of 16- and 32-bit documents made at 8 bits, compared with the merged image reduced to 8 bits
   * the same way; both measure agreement rather than exactness.
   */
  unit:
    | 'level'
    | '16-bit level'
    | 'float32 ULP'
    | 'CMYK level'
    | '16-bit CMYK level'
    | 'Lab level'
    | '16-bit Lab level'
    | 'sRGB level'
    | '8-bit level';
  /** Compared samples: the color channels and the merged alpha plane when present. */
  samples: number;
  differingSamples: number;
  differingPixels: number;
  alphaDiffering: number;
  /** The largest absolute difference. */
  max: number;
  /** Counts of the 32 smallest absolute differences that occur. */
  histogram: { difference: number; samples: number }[];
};

/** A rectangle as Photoshop stores it, bottom and right exclusive. */
export type PsdRect = { top: number; left: number; bottom: number; right: number };

/** Document-level facts. */
export type PsdInfo = {
  width: number;
  height: number;
  depth: number;
  /** Photoshop's color mode number: Bitmap 0, Grayscale 1, Indexed 2, RGB 3, CMYK 4, Multichannel 7, Duotone 8, Lab 9. */
  mode: number;
  modeName: string;
  /** Channels of the merged image, extra alpha channels included. */
  channels: number;
  psb: boolean;
  colorModeDataSize: number;
  resources: PsdResourceInfo[];
  resourcesTailSize: number;
  /** Document-level tagged blocks in file order. */
  blocks: PsdBlockInfo[];
  /** Where the layer records in effect come from: the layer section or a high-depth block. */
  layerSource: string;
  layerRecords: number;
  groups: number;
  globalMaskSize: number;
  mergedTransparency: boolean;
  /** The merged image's storage, `null` when the file has none. */
  mergedImage: { compression: string; alpha: boolean; matte: boolean; size: number } | null;
  /** What the viewer does not render for the document as a whole. */
  notes: string[];
};

/** One image resource. `label` names the documented IDs and is empty for others. */
export type PsdResourceInfo = { id: number; name: string; label: string; signature: string; size: number };

/** One tagged block: its key, signature and payload size, or the record count of a parsed `Lr16`/`Lr32`/`Layr`. */
export type PsdBlockInfo = { key: string; signature: string; size: number; layers: boolean };

/** How a layers panel presents a record. */
export type PsdLayerKind = 'group' | 'adjustment' | 'text' | 'smartObject' | 'shape' | 'fill' | 'pixel';

/** A layer or group as a layers panel shows it. */
export type PsdLayerNode = {
  /** The record's index in the layer records, the key for visibility overrides and details. */
  index: number;
  name: string;
  kind: PsdLayerKind;
  /** The bottom layer without transparency, Photoshop's Background. */
  background: boolean;
  /** The adjustment's name for adjustment layers. */
  adjustment?: string;
  /** Blend mode name such as `multiply` or `passThrough`, or the stored key when unknown. */
  blendMode: string;
  /** 0 to 255. */
  opacity: number;
  /** Fill opacity, 0 to 255. */
  fill: number;
  /** As saved. */
  visible: boolean;
  clipped: boolean;
  bounds: PsdRect;
  mask: { disabled: boolean; real: boolean } | null;
  vectorMask: { disabled: boolean } | null;
  /** Effects in the layer style that exist or are enabled; `null` without a style. */
  effects: PsdEffectSummary[] | null;
  /**
   * What the exact render refuses for this record, each with what the approximate render does instead, in words.
   * Adobe data the viewer does not ship (Photoshop's noise and angle tables, the Dot Gain 20% Gray profile unless the
   * document embeds it) counts as absent.
   */
  notes: string[];
  /** Raw tagged block keys in record order. */
  keys: string[];
  /** Groups: whether the group is expanded in Photoshop's Layers panel. */
  open?: boolean;
  /** Groups: the index of the hidden group-end record. */
  end?: number;
  /** Groups: children, bottom to top. */
  children?: PsdLayerNode[];
};

/** One effect of a layer style. */
export type PsdEffectSummary = {
  name: string;
  enabled: boolean;
  /** Why the exact render refuses the effect, when it does; the approximate render leaves it out. */
  unsupported?: string;
  /** Whether rendering needs Photoshop's effect noise table (Noise or Jitter), which is not shipped. */
  needsNoise: boolean;
  /**
   * Whether rendering needs Photoshop's angle table (an Angle gradient), which is not shipped: the exact render
   * refuses the effect and the approximate render leaves it out.
   */
  needsAngleTable: boolean;
};

/** Everything the viewer reads from one layer record. Sections are `null` when absent. */
export type PsdLayerDetail = {
  index: number;
  name: string;
  kind: PsdLayerKind;
  properties: {
    blendMode: string;
    blendKey: string;
    opacity: number;
    fill: number;
    visible: boolean;
    clipped: boolean;
    transparencyLocked: boolean;
    knockout: 'none' | 'shallow' | 'deep';
    blendClippedAsGroup: boolean;
    blendInteriorAsGroup: boolean;
    transparencyShapesLayer: boolean;
    layerMaskHidesEffects: boolean;
    vectorMaskHidesEffects: boolean;
    bounds: PsdRect;
    channels: number[];
    /** "Blend If" source and destination ranges per channel (gray first); `null` when they pass everything. */
    blendIf: { source: number[]; destination: number[] }[] | null;
    layerId?: number;
  };
  mask: PsdMaskDetail | { error: string } | null;
  vectorMask: { disabled: boolean; inverted: boolean; unlinked: boolean; records: number } | null;
  effects:
    | {
        key: string;
        /** The style's master switch. */
        visible: boolean;
        instances: (PsdEffectSummary & { present: boolean; settings: string })[];
      }
    | { error: string }
    | null;
  /** `settings` is the parsed settings as text. */
  adjustment: { label: string; supported: boolean; settings: string } | null;
  text: PsdTextDetail | { error: string } | null;
  smartObject: PsdSmartObjectDetail | { error: string } | null;
  notes: string[];
  blocks: PsdBlockInfo[];
};

/** A layer mask: the user mask rectangle, its parameters and the real raster mask of layers with a vector mask too. */
export type PsdMaskDetail = {
  rect: PsdRect;
  defaultColor: number;
  disabled: boolean;
  relativeToLayer: boolean;
  real: { rect: PsdRect; defaultColor: number; disabled: boolean } | null;
  userDensity?: number;
  userFeather?: number;
  vectorDensity?: number;
  vectorFeather?: number;
};

/** A type layer's text and typography as stored. */
export type PsdTextDetail = {
  text?: string;
  antiAlias?: string;
  vertical?: boolean;
  warp?: string;
  /** `xx, xy, yx, yy, tx, ty`. */
  transform: number[];
  fonts?: string[];
  styleRuns?: { length: number; font?: string; size?: number }[];
  /** Set when the EngineData could not be read. */
  engineError?: string;
};

/** A smart object's placement, contents and filters. */
export type PsdSmartObjectDetail = {
  key: string;
  external: boolean;
  contentId?: string;
  placementId?: string;
  contentType?: number;
  page?: number;
  totalPages?: number;
  size: { width: number; height: number } | null;
  resolution?: number;
  /** Corner quad: top-left, top-right, bottom-right, bottom-left `x, y`. */
  transform: number[] | null;
  nonAffineTransform: number[] | null;
  warp?: string;
  filters: {
    enabled: boolean;
    maskEnabled: boolean;
    filters: { name: string; enabled: boolean; opacity: number; mode: string }[];
  } | null;
  linkedFile: { kind: string; version: number; fileName: string; fileType: string; size: number } | null;
};

/** A layer's own pixels without masks or effects, and its mask channels, all at 8 bits. */
export type PsdLayerPixels = {
  left: number;
  top: number;
  width: number;
  height: number;
  pixels: Uint8Array;
  /** `id` -2 is the user mask (with a vector mask: Photoshop's cached product), -3 the real raster mask. */
  masks: {
    id: number;
    left: number;
    top: number;
    width: number;
    height: number;
    values: Uint8Array;
    defaultColor: number;
    disabled: boolean;
  }[];
};

/**
 * Loads and initializes the viewer module once; concurrent calls share the work and a failed attempt can be retried.
 * Browsers fetch the adjacent `.wasm` asset, Node reads it from disk. `input` overrides the module source.
 */
export function loadPsdViewer(input?: ViewerWasmInput): Promise<ViewerCodec> {
  pending ??= import('../wasm-viewer/photoshop_psd_viewer.js')
    .then(async (codec) => {
      await codec.default({ module_or_path: input ?? (await nodeModuleBytes()) });
      return codec;
    })
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  return pending;
}

/** The generated bindings of the viewer module. */
export type ViewerCodec = typeof import('../wasm-viewer/photoshop_psd_viewer.js');

/** What the bindings accept as the WebAssembly module: a URL, a response, bytes or a compiled module. */
export type ViewerWasmInput = NonNullable<Parameters<ViewerCodec['default']>[0]>;

let pending: Promise<ViewerCodec> | undefined;

/** The WebAssembly handles behind the libraries {@link createFontLibrary} made, until freed. */
const libraryHandles = new WeakMap<PsdFontLibrary, FontLibraryHandle>();

/** The library documents use when the caller passes none, created on first use. */
let emptyLibrary: FontLibraryHandle | undefined;

/**
 * Wraps a handle; renders keep their WebAssembly images in `images` until disposed or the document closes. Calls
 * taking a library resolve it to its handle, a freed or absent one to an empty library.
 */
function makeViewerDocument(
  codec: ViewerCodec,
  handle: PsdDocumentHandle,
  info: PsdInfo,
  layers: PsdLayerNode[]
): PsdViewerDocument {
  const images = new Map<PsdRender, RenderedImage>();
  let open = true;
  const closed = (): PsdResult<never> => ({ ok: false, error: { kind: 'invalid', message: 'the document is closed' } });
  const libraryOf = (fonts: PsdFontLibrary | undefined) =>
    (fonts && libraryHandles.get(fonts)) ?? (emptyLibrary ??= new codec.PsdFontLibrary());

  return {
    info,
    layers,
    render(settings, visibility = [], fonts) {
      if (!open) {
        return closed();
      }

      const start = performance.now();
      const rendered = attempt(() => handle.render({ ...settings, visibility: [...visibility] }, libraryOf(fonts)));
      if (!rendered.ok) {
        return rendered;
      }

      const image = rendered.value;
      const milliseconds = performance.now() - start;
      const render: PsdRender = {
        width: image.width,
        height: image.height,
        depth: image.depth as PsdRender['depth'],
        pixels: image.rgba8(),
        milliseconds,
        approximations: image.approximations() as string[],
        dispose() {
          images.get(render)?.free();
          images.delete(render);
        }
      };
      images.set(render, image);
      return { ok: true, value: render };
    },
    fonts(fonts) {
      return open ? attempt(() => handle.documentFonts(libraryOf(fonts)) as PsdDocumentFonts) : closed();
    },
    textSupport(index, fonts) {
      return open ? attempt(() => handle.textSupport(index, libraryOf(fonts)) as PsdTextSupport | null) : closed();
    },
    merged() {
      return open ? attempt(() => handle.merged() as PsdImage) : closed();
    },
    difference(render) {
      const image = images.get(render);
      if (!open || !image) {
        return {
          ok: false,
          error: { kind: 'invalid', message: 'the render was disposed or belongs to another document' }
        };
      }

      return attempt(() => handle.difference(image) as PsdDifference);
    },
    layerDetail(index) {
      return open ? attempt(() => handle.layerDetail(index) as PsdLayerDetail) : closed();
    },
    layerPixels(index) {
      return open ? attempt(() => handle.layerPixels(index) as PsdLayerPixels) : closed();
    },
    close() {
      if (!open) {
        return;
      }

      open = false;
      for (const image of images.values()) {
        image.free();
      }

      images.clear();
      handle.free();
    }
  };
}

/** The failure of a call on a freed font library. */
function closedFailure(): PsdResult<never> {
  return { ok: false, error: { kind: 'invalid', message: 'the font library was freed' } };
}

/** Bytes as the module takes them, without copying a `Uint8Array`. */
function asBytes(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

/** Runs a call into the viewer module, turning its thrown errors into failures. */
function attempt<T>(run: () => T): PsdResult<T> {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    return { ok: false, error: toFailure(error) };
  }
}

/** The module names expected errors `PsdUnsupportedError` and `PsdError`; anything else is invalid input too. */
function toFailure(error: unknown): PsdFailure {
  if (error instanceof Error) {
    return { kind: error.name === 'PsdUnsupportedError' ? 'unsupported' : 'invalid', message: error.message };
  }

  return { kind: 'invalid', message: String(error) };
}

/** Under Node, which cannot fetch `file:` URLs, the module's bytes; in browsers `undefined`, to fetch it. */
async function nodeModuleBytes(): Promise<Uint8Array | undefined> {
  const node = (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node;
  if (!node) {
    return undefined;
  }

  // Computed specifiers keep bundlers from emitting the asset twice or resolving a Node module for the browser.
  const path = '../wasm-viewer/photoshop_psd_viewer_bg.wasm';
  const fs = 'node:fs/promises';
  const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile: (url: URL) => Promise<Uint8Array> };
  return readFile(new URL(path, import.meta.url));
}
