// Photoshop documents opened for viewing: structure, Photoshop-exact rendering and comparison with the merged image
// Photoshop saved, by the viewer module built in photoshop-analysis/psd-wasm with its `viewer` feature. Paint's flat
// codec (`readPsd`, `writePsd` in ./index) stays in its own, much smaller module.
import type {
  PsdFontLibrary as FontLibraryHandle,
  PsdBudgetOptions as BudgetOptions,
  PsdBudgetError as BudgetError,
  PsdDocumentHandle,
  PsdRegionPixels as RegionPixels,
  PsdRegionRect as RegionRect,
  RenderedImage
} from '../wasm-viewer/photoshop_psd_viewer.js';

/**
 * Opens a PSD or PSB for viewing, loading the viewer module on first use. The document keeps the parsed file in
 * WebAssembly memory until {@link PsdViewerDocument.close}. Files that are not Photoshop documents, or whose header or
 * outer sections are unusable, fail with `kind: 'invalid'`; damaged inner structures stay readable.
 * Admission defaults to 128 MiB per allocation and 2 GiB live. The 30,806×45,624 public PSB needs more than the
 * WASM32 default 64 MiB for compressed source storage even though its rendered output stays windowed. `budget`
 * overrides these limits; the binding counts both input copies automatically. Policy refusals have `kind: 'budget'`.
 */
export async function openPsd(
  bytes: Uint8Array | ArrayBuffer,
  budget: PsdBudgetOptions = {}
): Promise<PsdResult<PsdViewerDocument>> {
  const codec = await loadPsdViewer();
  const opened = attempt(() => codec.PsdDocumentHandle.openWithBudget(asBytes(bytes), { ...openingBudget, ...budget }));
  if (!opened.ok) {
    return opened;
  }

  const handle = opened.value;
  const layers = attempt(() => handle.layers() as PsdLayerNode[]);
  if (!layers.ok) {
    handle.free();
    return layers;
  }

  return { ok: true, value: makeViewerDocument(codec, handle, layers.value, strictOpening()) };
}

/**
 * Opens a PSD or PSB as Photoshop 26 opens it, loading the viewer module on first use. The strict reading of
 * {@link openPsd} is kept where it is Photoshop's document, and where Photoshop refuses a file the strict reader reads
 * ({@link PsdOpening.photoshopRefuses}); the strict reader accepts damaged channel streams as they are, so both readings
 * are made and compared. Otherwise the document is Photoshop's interpretation: damaged channels decoded as Photoshop
 * decodes them, group markers and blend modes repaired, or the stored composite instead of the layers, as
 * {@link PsdViewerDocument.opening} reports.
 *
 * Photoshop's prompts are answered by `answers`. A prompt Photoshop shows that `answers` leaves unanswered fails with
 * `kind: 'needsAnswer'` and the prompt; open again with its answer. Files Photoshop refuses and the strict reader
 * cannot read, and Cancel answers, fail with `kind: 'refused'` and Photoshop's behavior as the message.
 * Uses the same default admission budget as {@link openPsd}; recovery still decodes whole channels.
 */
export async function openPsdLikePhotoshop(
  bytes: Uint8Array | ArrayBuffer,
  answers: PsdOpenAnswers = {},
  budget: PsdBudgetOptions = {}
): Promise<PsdResult<PsdViewerDocument>> {
  const codec = await loadPsdViewer();
  const outcome = attempt(
    () =>
      codec.PsdDocumentHandle.openLikePhotoshopWithBudget(asBytes(bytes), answers, {
        ...openingBudget,
        ...budget
      }) as OpenOutcome
  );
  if (!outcome.ok) {
    return outcome;
  }

  const result = outcome.value;
  if (result.outcome === 'refused') {
    return { ok: false, error: { kind: 'refused', message: result.message } };
  }

  if (result.outcome === 'needsAnswer') {
    return { ok: false, error: { kind: 'needsAnswer', message: result.prompt.message, prompt: result.prompt } };
  }

  const layers = attempt(() => result.document.layers() as PsdLayerNode[]);
  if (!layers.ok) {
    result.document.free();
    return layers;
  }

  return { ok: true, value: makeViewerDocument(codec, result.document, layers.value, result.opening) };
}

/** What `PsdDocumentHandle.openLikePhotoshop` returns. */
type OpenOutcome =
  | { outcome: 'opened'; document: PsdDocumentHandle; opening: PsdOpening }
  | { outcome: 'refused'; message: string }
  | { outcome: 'needsAnswer'; prompt: PsdOpenPrompt };

/**
 * Answers to the prompts Photoshop shows while opening, each absent until its prompt was shown. `corruptLayers`
 * answers "This file contains one or more layers which appear to be corrupt. Continue reading layers?": `ok` keeps
 * every layer with each damaged channel as Photoshop decodes it, `flatten` opens the stored composite instead of the
 * layers, `cancel` opens nothing. `layerDataProblem` answers "There was a problem reading the layer data. Read the
 * composite data instead?", shown for more than 8,000 layers: `readComposite` opens the stored composite (inferred;
 * Photoshop was only seen to Cancel), `cancel` opens nothing.
 */
export type PsdOpenAnswers = {
  corruptLayers?: 'ok' | 'flatten' | 'cancel';
  layerDataProblem?: 'readComposite' | 'cancel';
};

/**
 * A prompt Photoshop shows before opening a file: `id` is the {@link PsdOpenAnswers} key its answer goes under,
 * `message` its verbatim text, `buttons` its buttons in Photoshop's order, `default` marking Photoshop's default button
 * where the evidence names one.
 */
export type PsdOpenPrompt = {
  [Id in keyof PsdOpenAnswers]-?: {
    id: Id;
    message: string;
    buttons: { answer: NonNullable<PsdOpenAnswers[Id]>; label: string; default: boolean }[];
  };
}[keyof PsdOpenAnswers];

/** How a document was read. Documents of {@link openPsd} are strict readings without alerts or repairs. */
export type PsdOpening = {
  /** `photoshop` when the document is Photoshop's interpretation, `strict` for the lossless reading. */
  reader: 'strict' | 'photoshop';
  /** The prompts and alerts Photoshop shows while opening, in order, each with the label of the button answering it. */
  alerts: PsdOpenAlert[];
  /** What Photoshop's interpretation changed from the strict reading, in words. */
  repairs: string[];
  /** Why the strict reader could not read the file, when it could not. */
  strictError?: string;
  /**
   * Photoshop's refusal of a file the strict reader reads, naming Photoshop's behavior; the document is then the strict
   * reading.
   */
  photoshopRefuses?: string;
};

/** A prompt or alert Photoshop shows while opening, with its verbatim `message` and the `answer` button's label. */
export type PsdOpenAlert = {
  kind: 'corruptLayers' | 'layerDataProblem' | 'unsupportedBlendMode' | 'groupsRepaired';
  message: string;
  answer: string;
};

/** The opening report of a strict reading Photoshop opens alike. */
function strictOpening(): PsdOpening {
  return { reader: 'strict', alerts: [], repairs: [] };
}

/**
 * Creates an empty font library for type rerasterization and imported cache mixing, loading WASM on first use.
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
    addActiveFace(bytes, faceIndex, provenance) {
      return open ? attempt(() => handle.addActiveFace(asBytes(bytes), faceIndex, provenance)) : closedFailure();
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

/** Per-call buffer admission limits. Retained bytes cover caller-owned fonts, input and caches. */
export type PsdBudgetOptions = BudgetOptions;

/** A value, or the reason it could not be produced. */
export type PsdResult<T> = { ok: true; value: T } | { ok: false; error: PsdFailure };

/**
 * Why an operation failed: `unsupported` when the renderer meets a setting it does not reproduce exactly (the message
 * names it, for example `layer "Logo": a non-parallelogram smart-object quad`), `invalid` for unreadable input. Opening
 * as Photoshop does ({@link openPsdLikePhotoshop}) fails with `refused` when Photoshop does not open the file, the
 * message naming Photoshop's behavior, and with `needsAnswer` when Photoshop asks `prompt` first, the message being the
 * prompt's text. `budget` is a host policy refusal, with the resource, requested amount and limit preserved from WASM.
 */
export type PsdFailure =
  | { kind: 'unsupported' | 'invalid' | 'refused'; message: string }
  | { kind: 'needsAnswer'; message: string; prompt: PsdOpenPrompt }
  | ({ kind: 'budget'; message: string } & Pick<BudgetError, 'resource' | 'requested' | 'limit'>);

/** An open document. Every call is synchronous; run it in a worker for large files. */
export type PsdViewerDocument = {
  /** Header, resources, document-level blocks and the merged image's layout. */
  readonly info: PsdInfo;
  /** How the file was read: strictly, or as Photoshop interprets it, with Photoshop's alerts and repairs. */
  readonly opening: PsdOpening;
  /** The layer tree, bottom to top as stored; group children are bottom to top as well. */
  readonly layers: readonly PsdLayerNode[];
  /** The saved layer comps and animation frames, which {@link PsdRenderSettings.state} renders. */
  readonly states: PsdStates;
  /**
   * Composites the document at its depth with `settings`. `visibility` overrides the saved visibility of layer
   * records by index for this render only. With {@link PsdRenderSettings.typeLayers}, type layers re-render from their
   * text with `fonts` (none when omitted). Active faces also supply imported cache-mixing decisions with
   * `typeLayers: false`; an unknown active-name inventory must stay omitted. The render keeps its full-depth
   * composite for {@link difference} until disposed or the document closes.
   * Targets Photoshop 26 with caller-supplied settings; historical authoring state is not reconstructed.
   * A successful render can differ from the saved snapshot, even for Photoshop 26 files. Use {@link merged}
   * for the stored pixels; an empty approximation list describes only this render policy.
   */
  render(
    settings: PsdRenderSettings,
    visibility?: Iterable<readonly [number, boolean]>,
    fonts?: PsdFontLibrary
  ): PsdResult<PsdRender>;
  /**
   * Composites exact process channels, then converts them separately to caller-configured display sRGB.
   * Requires `approximate: false`; display conversion can still report approximations without changing process
   * samples. Profiles come only from the document and `color`, never from installed profiles. Returned arrays own
   * their storage and need no disposal. This result cannot be passed to `difference`.
   */
  renderColor(
    settings: PsdRenderSettings & { approximate: false },
    color: PsdColorSettings,
    visibility?: Iterable<readonly [number, boolean]>,
    fonts?: PsdFontLibrary
  ): PsdResult<PsdColorRender>;
  /**
   * Decodes native saved process and auxiliary planes without compositing, unmatting or display conversion.
   * The saved image may be stale. Optional visibility needs one boolean per saved plane and only describes the view.
   * Returned arrays own their storage; calls after close fail.
   */
  savedProcessChannels(visibility?: boolean[]): PsdResult<PsdSavedProcessChannels>;
  /** Renders one in-canvas rectangle. Pixels and metadata own their storage; no dispose call is needed. */
  renderRegion(
    rectangle: PsdRegionRect,
    settings: PsdWindowSettings,
    visibility?: Iterable<readonly [number, boolean]>,
    fonts?: PsdFontLibrary
  ): PsdResult<PsdRegionPixels>;
  /** Renders 1 to 256 rectangles in one snapshot. Their combined area must fit maxWorkPixels. */
  renderRegions(
    rectangles: PsdRegionRect[],
    settings: PsdWindowSettings,
    visibility?: Iterable<readonly [number, boolean]>,
    fonts?: PsdFontLibrary
  ): PsdResult<PsdRegionPixels[]>;
  /** Samples the fresh layer render at (step*x, step*y). Step must be a positive integer. */
  renderOverview(
    step: number,
    settings: PsdWindowSettings,
    visibility?: Iterable<readonly [number, boolean]>,
    fonts?: PsdFontLibrary
  ): PsdResult<PsdRegionPixels>;
  /**
   * Samples the potentially stale saved composite, ignoring render settings and edits. Use only as a temporary
   * first frame, replacing it with a fresh layer render. Zero uses the WASM default work limit.
   * `budget` overrides WASM32 admission defaults and accounts for caller-retained storage.
   */
  savedOverview(step: number, maxWorkPixels?: number, budget?: PsdBudgetOptions): PsdResult<PsdRegionPixels>;
  /**
   * The fonts the document's type layers use, their availability in `fonts` (none when omitted), and supplied
   * releases that differ from the document's recorded versions. Availability alone does not imply exact text.
   */
  fonts(fonts?: PsdFontLibrary): PsdResult<PsdDocumentFonts>;
  /**
   * Whether type layer record `index` re-renders from its text with `fonts`, re-rendering it once to decide; `null`
   * for other records.
   */
  textSupport(index: number, fonts?: PsdFontLibrary): PsdResult<PsdTextSupport | null>;
  /**
   * Photoshop's saved merged image as straight 8-bit RGBA, other color modes than RGB and Grayscale converted to sRGB
   * as renders are; `unsupported` when the file has none. Displays the stored snapshot without reconstructing layers
   * or validating historical text state. Decoding it does not certify an editable state or next-open composition.
   */
  merged(): PsdResult<PsdImage>;
  /**
   * Compares a live render with the stored snapshot. Differences can reflect authoring-state changes rather than
   * next-open rendering errors. Equality applies only to these pixels and does not authorize an edit.
   */
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
   * documents render leniently: each refused setting is drawn by the nearest model the renderer has (dithered
   * gradients undithered, out-of-range settings moved to the nearest verified ones, unverified routes taken as the
   * verified ones closest to them, a Photo Filter model), or left out or kept from its cached raster where it has none;
   * 16- and 32-bit documents the depth compositor refuses only for adjustments it has a model of composite at their own
   * depth with those models, others at 8 bits, 32-bit ones with their adjustments applied to linear samples. Indexed,
   * Duotone and Multichannel documents, and CMYK
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
  /**
   * Known active PostScript-name inventory for imported missing-font decisions. Omit or use null when unknown.
   * An empty array means known-empty. A partial list of supplied font files is not an inventory. Ignored by WASM
   * without active face bytes; never enables rerasterization.
   */
  availableFonts?: readonly string[] | null;
  /**
   * A saved layer comp or animation frame ({@link PsdViewerDocument.states}) to render instead of the document as
   * saved; visibility overrides apply over it. Exact within the frames and comps Photoshop 26's rules are verified for;
   * outside them the render fails, or with `approximate` applies the same rules and lists them. The merged image
   * Photoshop saved shows the document as saved, so it is the comparison only for that state. Absent or `null` renders
   * the document as saved.
   */
  state?: PsdStateChoice | null;
};

/** A nonempty integer rectangle inside the document canvas. */
export type PsdRegionRect = RegionRect;

/** Transferable RGBA8 with document origin, sampling stride, allocation strategy and fidelity metadata. */
export type PsdRegionPixels = RegionPixels;

/**
 * Window rendering settings. The work limit defaults to 16,777,216 pixels and bounds individual allocations and batch
 * output, not total memory. Spatial dependencies exceeding it fail as unsupported before a full-canvas allocation.
 */
export type PsdWindowSettings = PsdRenderSettings & {
  maxWorkPixels?: number;
  /** Overrides WASM32 admission defaults; retainedBytes includes caller-owned input, fonts and caches. */
  budget?: PsdBudgetOptions;
};

/** A saved state to render: a frame or a layer comp by its persistent ID. */
export type PsdStateChoice = { frame: number } | { comp: number };

/** A document's saved alternate states. */
export type PsdStates = {
  /** Layer comps in panel order. */
  comps: { id: number; name: string; comment?: string }[];
  /** The comp last applied, which the saved layers need not match; `null` when none was. */
  lastAppliedComp: number | null;
  /** The frames of the active frame set in playback order, with their delays in hundredths of a second. */
  frames: { id: number; delay: number }[];
  /** The saved active frame, whose selection leaves the document as saved; `null` without an animation. */
  activeFrame: number | null;
  /** Comp or animation resources that do not parse, which then count as absent. */
  errors: string[];
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
 * Host-supplied fonts for type rerasterization and imported cache mixing. Adding a raster font replaces that name;
 * distinct active faces under one name make imported validation abstain. Every call is synchronous.
 */
export type PsdFontLibrary = {
  /**
   * Adds a TrueType or OpenType CFF font file (`.ttf`, `.otf`) under its PostScript name. Font collections (`.ttc`),
   * WOFF files, fonts without a PostScript name and outlines the renderer does not read fail as `unsupported`, other
   * bytes as `invalid`. Standalone TrueType bytes also supply imported validation; `addActiveFace` preserves an
   * explicit source identifier and supports original collection indices without adding raster fonts.
   */
  add(bytes: Uint8Array | ArrayBuffer): PsdResult<PsdFontInfo>;
  /**
   * Registers original active TrueType sfnt/TTC/OTC bytes for imported cache mixing, without adding raster fonts.
   * Pass the original collection index and a source identifier. Validate the returned PostScript name against the
   * intended face. CFF and invalid faces fail. Distinct same-name faces abstain; identical faces deduplicate.
   * Use with `typeLayers: false`; partial face input never implies that other fonts are missing.
   */
  addActiveFace(bytes: Uint8Array | ArrayBuffer, faceIndex: number, provenance: string): PsdResult<string>;
  /** The raster fonts added, sorted by PostScript name. */
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
  /** Raster font availability by PostScript name; a present font can still have a release mismatch. */
  fonts: { name: string; available: boolean; layers: number[] }[];
  layers: { index: number; name: string; visible: boolean; fonts: string[]; error?: string }[];
  /** Supplied raster fonts or unique active faces whose releases differ from the document's recorded versions. */
  releaseMismatches: PsdFontReleaseMismatch[];
};

/**
 * Whether a type layer re-renders from its text with a library, as {@link PsdRenderSettings.typeLayers} would render
 * it: `reason` is the renderer's refusal when not, such as a missing font or an unverified setting. 16- and 32-bit
 * compositors can still refuse the layer's blending.
 */
export type PsdTextSupport = {
  fonts: string[];
  /** Fonts unavailable for rasterization, separate from supplied release mismatches. */
  missing: string[];
  /** Supplied release mismatches for this layer's fonts. Any mismatch prevents exact text support. */
  releaseMismatches: PsdFontReleaseMismatch[];
  /** Whether re-rendering succeeds without a known release mismatch; equal versions do not prove identical outlines. */
  supported: boolean;
  reason?: string;
};

/**
 * A supplied font with the required PostScript name but a different release from the document's recorded version.
 * Version evidence diagnoses mismatches; equal versions cannot certify identical charstrings because PSDs do not
 * embed the font programs.
 */
export type PsdFontReleaseMismatch = {
  /** The font's PostScript name. */
  name: string;
  /** The renderer's explanation of the mismatch. */
  reason: string;
  /** Version saved in the document's text resources. */
  recordedVersion: string;
  /** Version in the supplied face, omitted when the face has no version metadata. */
  suppliedVersion?: string;
};

/** Straight (not premultiplied) 8-bit RGBA, row by row. */
export type PsdImage = { width: number; height: number; pixels: Uint8Array };

/**
 * A composite for the existing viewer display path. `pixels` are display RGBA8, not native process channels.
 * Use `renderColor` for separately identified process and configured sRGB samples.
 */
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
   * layer setting left out or substituted, as `“layer”: setting — what was done`). Includes saved-state selection
   * reports. Empty means no approximation under this render policy, not equivalence to historical saved pixels.
   */
  approximations: string[];
  /** Frees the full-depth composite kept for comparisons; `pixels` stay usable. */
  dispose(): void;
};

/**
 * Explicit process-to-sRGB conversion settings. The caller attests that `srgb` describes sRGB; unrecognized
 * serializations use a reported approximation. Missing or invalid required profiles fail instead of being guessed.
 */
export type PsdColorSettings = {
  /** Destination sRGB ICC profile bytes, required for every configured conversion. */
  srgb: Uint8Array;
  /** Working RGB profile for untagged RGB or expanded Indexed data. Embedded profiles take precedence. */
  workingRgb?: Uint8Array;
  /** Working Gray profile for untagged Grayscale or expanded Bitmap data. */
  workingGray?: Uint8Array;
  /** Working CMYK profile for untagged CMYK data. */
  workingCmyk?: Uint8Array;
  /** ACE-target conversion; generic ICC fallbacks are reported separately. Defaults to `ace`. */
  engine?: 'ace';
  /** Rendering intent, `relative` by default. */
  intent?: 'relative' | 'perceptual' | 'saturation' | 'absolute';
  /** Defaults to true. */
  blackPointCompensation?: boolean;
  /** Defaults to false. True reports an approximation because ACE dither is not implemented. */
  dither?: boolean;
  /** Direct float evaluation, true by default. Float display conversion remains approximate. */
  preciseFloat?: boolean;
  /** Records an import already applied by the caller; never changes process samples. Defaults to `preserve`. */
  importPolicy?: 'preserve' | 'convert' | 'off';
  /** Correct continuous display bounds for the saved pixel aspect ratio, false by default. */
  pixelAspectCorrection?: boolean;
  /** Defaults to false. True, or an OCIO document kind, fails because an external OCIO processor is required. */
  ocio?: boolean;
  /** Defaults to false; true fails because proof presentation is unsupported. */
  proof?: boolean;
  /** Defaults to false; true fails because scene-referred presentation is unsupported. */
  sceneReferred?: boolean;
  /** Defaults to false; true fails because HDR preview presentation is unsupported. */
  hdrPreview?: boolean;
};

/**
 * Color channels followed by a separate alpha sample per interleaved pixel. Wire16 uses PSD's wire scale, not Q15.
 * Packed Bitmap rows are the exception: most significant bit first, 1 means black, byte padded per row, no alpha.
 */
export type PsdColorSamples =
  | { encoding: 'packed-bitmap' | 'byte'; values: Uint8Array }
  | { encoding: 'wire16'; values: Uint16Array }
  | { encoding: 'float32'; values: Float32Array };

/** Exact process composite and its separately converted display output. No WASM resources are retained. */
export type PsdColorRender = {
  width: number;
  height: number;
  /** Native Photoshop color mode number; process samples are never implicitly sRGB. */
  mode: number;
  /** Process color channel count before alpha. Indexed stores an index plus alpha; its palette stays in colorModeData. */
  colorChannels: number;
  /** Original color-mode data, including the Indexed palette or ink data. */
  colorModeData: Uint8Array;
  /** Exact native process samples. Float RGB/Gray process samples are linear. */
  process: PsdColorSamples;
  /** Target-encoded RGB plus alpha at process precision, independent of process samples. */
  srgb: PsdColorSamples;
  /** Display sRGB RGBA8, reduced without dither for browser display. */
  rgba8: Uint8Array;
  /** Display conversion provenance; exactness here describes conversion only. */
  conversion: PsdDisplayConversion;
  /** DisplayConversion messages suitable for the viewer's existing approximation list. */
  approximations: string[];
  /** Continuous presentation bounds, optionally corrected for pixel aspect ratio; sample dimensions do not change. */
  displayWidth: number;
  displayHeight: number;
};

/** Provenance of configured display conversion, independent of exact process compositing. */
export type PsdDisplayConversion = {
  exact: boolean;
  requestedEngine: 'ace';
  engine: 'ACE verified integer route' | 'generic ICC';
  operation: string;
  /** WASM provenance spelling: `Some(Embedded)`, `Some(Working)` or `None` for fixed document Lab. */
  sourceOrigin: string;
  destinationSHA256: string;
  importPolicy: 'Preserve' | 'Convert' | 'Off';
  intent: string;
  blackPointCompensation: boolean;
  dither: boolean;
  /** Null for an admitted exact route; otherwise the generic conversion and omitted ACE dither are identified. */
  approximation: {
    kind: 'DisplayConversion';
    sourceSHA256: string;
    destinationSHA256: string;
    intent: string;
    blackPointCompensation: boolean;
    preciseFloat: boolean;
    dither: boolean;
    aceDitherImplemented: false;
  } | null;
};

/** Native saved planes, preserving auxiliary plates, profile resources and float bit patterns. */
export type PsdSavedProcessChannels = {
  width: number;
  height: number;
  mode: number;
  depth: number;
  /** Native decoded bytes, including original byte order, Bitmap packing and saved matte. */
  planes: PsdSavedProcessPlane[];
  colorModeData: Uint8Array;
  /** Original channel metadata and color-profile resource payloads, including ICC resource 1039 when present. */
  resources: { id: number; bytes: Uint8Array }[];
  metadataError: string | null;
  source: string;
};

/** One saved plane and its optional channel display metadata; visibility is null when the caller supplied none. */
export type PsdSavedProcessPlane = {
  index: number;
  role: 'process' | 'mergedTransparency' | 'spot' | 'alpha' | 'auxiliary';
  bytes: Uint8Array;
  visible: boolean | null;
  name?: string;
  persistentId?: number;
  displayKind?: number;
  colorSpace?: number;
  color?: number[];
  opacityOrSolidityPercent?: number;
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
  /**
   * What feeds the pixels of a 3D or video layer. Neither is rendered: the layer shows the pixels Photoshop saved,
   * for video its frame at the saved time.
   */
  pixelSource?: '3d' | 'video';
  /** The adjustment's name for adjustment layers. */
  adjustment?: string;
  /** Blend mode name such as `multiply` or `passThrough`, or the stored key when unknown. */
  blendMode: string;
  /** 0 to 255, as Photoshop 26 imports it and its Layers panel shows it (see `legacyOpacity`). */
  opacity: number;
  /** Fill opacity, 0 to 255, as Photoshop 26 imports it. */
  fill: number;
  /** "Transparency Shapes Layer", as Photoshop 26 imports it. */
  transparencyShapesLayer: boolean;
  /** Set when Photoshop 26 imports the stored opacity as Fill; `null` when it imports the record as stored. */
  legacyOpacity: PsdLegacyOpacity | null;
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
   * Photoshop's effect noise table, the Angle gradient table and the Dot Gain 20% Gray curve are generated byte for byte,
   * so none of them is missing.
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

/**
 * A legacy Color Dodge, Color Burn or Difference record (its reader infers it older than version 60, with full Fill
 * and no effects) whose stored opacity Photoshop 26 imports as Fill, at full opacity with "Transparency Shapes Layer"
 * off. The render follows this exactly: it is not an approximation.
 */
export type PsdLegacyOpacity = {
  /** The opacity byte in the file, which becomes Fill. */
  storedOpacity: number;
  /** The record version Photoshop's reader infers from the record's tagged blocks. */
  inferredVersion: number;
};

/** One effect of a layer style. */
export type PsdEffectSummary = {
  name: string;
  enabled: boolean;
  /** Why the exact render refuses the effect, when it does; the approximate render leaves it out. */
  unsupported?: string;
};

/** Everything the viewer reads from one layer record. Sections are `null` when absent. */
export type PsdLayerDetail = {
  index: number;
  name: string;
  kind: PsdLayerKind;
  properties: {
    blendMode: string;
    blendKey: string;
    /** Opacity and Fill as Photoshop 26 imports them, with `legacyOpacity` as in `PsdLayerNode`. */
    opacity: number;
    fill: number;
    legacyOpacity: PsdLegacyOpacity | null;
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

/** Allows compressed source storage for existing huge PSBs without admitting a full-canvas render. */
const openingBudget = {
  allocationBytes: 128 * 1024 * 1024,
  liveBytes: 2 * 1024 * 1024 * 1024
} satisfies PsdBudgetOptions;

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
  layers: PsdLayerNode[],
  opening: PsdOpening
): PsdViewerDocument {
  const images = new Map<PsdRender, RenderedImage>();
  let open = true;
  const closed = (): PsdResult<never> => ({ ok: false, error: { kind: 'invalid', message: 'the document is closed' } });
  const libraryOf = (fonts: PsdFontLibrary | undefined) =>
    (fonts && libraryHandles.get(fonts)) ?? (emptyLibrary ??= new codec.PsdFontLibrary());

  return {
    info: handle.info() as PsdInfo,
    opening,
    layers,
    states: handle.states() as PsdStates,
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
    renderColor(settings, color, visibility = [], fonts) {
      return open
        ? attempt(() =>
            handle.renderColor({ ...settings, visibility: [...visibility] }, color, libraryOf(fonts)) as PsdColorRender
          )
        : closed();
    },
    savedProcessChannels(visibility) {
      return open ? attempt(() => handle.savedProcessChannels(visibility) as PsdSavedProcessChannels) : closed();
    },
    renderRegion(rectangle, settings, visibility = [], fonts) {
      const { left, top, width, height } = rectangle;
      return open
        ? attempt(() =>
            handle.renderRegion(
              left,
              top,
              width,
              height,
              { ...settings, visibility: [...visibility] },
              libraryOf(fonts)
            )
          )
        : closed();
    },
    renderRegions(rectangles, settings, visibility = [], fonts) {
      return open
        ? attempt(() =>
            handle.renderRegions(rectangles, { ...settings, visibility: [...visibility] }, libraryOf(fonts))
          )
        : closed();
    },
    renderOverview(step, settings, visibility = [], fonts) {
      return open
        ? attempt(() => handle.renderOverview(step, { ...settings, visibility: [...visibility] }, libraryOf(fonts)))
        : closed();
    },
    savedOverview(step, maxWorkPixels = 0, budget) {
      return open ? attempt(() => handle.savedOverview(step, maxWorkPixels, budget)) : closed();
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

/** Preserves typed budget refusals; unsupported features and unreadable input remain separate failures. */
function toFailure(error: unknown): PsdFailure {
  if (
    error instanceof Error &&
    error.name === 'PsdBudgetError' &&
    'resource' in error &&
    typeof error.resource === 'string' &&
    'requested' in error &&
    typeof error.requested === 'bigint' &&
    'limit' in error &&
    typeof error.limit === 'bigint'
  ) {
    return {
      kind: 'budget',
      message: `This operation exceeds the viewer's resource budget (${error.resource}: ${error.requested} requested, limit ${error.limit}).`,
      resource: error.resource,
      requested: error.requested,
      limit: error.limit
    };
  }

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
