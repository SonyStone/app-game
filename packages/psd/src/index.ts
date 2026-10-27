// Layered Photoshop documents, read and written by the Rust/WASM codec built in photoshop-analysis/psd-wasm.
import type { PsdDocument } from './psd';

export * from './editor';
export * from './psd';

/**
 * Reads the raster layers of a PSD or PSB: RGB, Grayscale or Bitmap at 1, 8, 16 or 32 bits, any compression. Groups
 * are flattened into their layers; masks, effects, adjustment layers and text are not rendered. A document without
 * layers becomes one layer of its flattened image. Loads the codec on first use. Throws a readable error for other
 * color modes and damaged files.
 */
export async function readPsd(bytes: ArrayBuffer | Uint8Array): Promise<PsdDocument> {
  const codec = await loadPsd();
  return codec.readPsd(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) as PsdDocument;
}

/**
 * Writes an 8-bit RGB document of `document.layers`, PackBits-compressed as Photoshop saves them, with `composite`,
 * the straight RGBA flattened canvas shown by programs that read no layers. Canvases over 30000 pixels on a side
 * become PSB. Names are stored as Unicode and as Mac Roman. Throws when the canvas exceeds 300000 pixels on a side
 * or a pixel buffer does not match its size. Context selects complete Photoshop 26 first-save creation, with
 * caller-owned identity, clocks, profile and layer metadata. Two-argument output uses the codec's identity-only
 * legacy mode, now with stable layer IDs beginning at 2 and the largest allocated ID in resource 1044.
 * Imported originals must use preservation/editor saves. Invalid operands throw PsdWriteError without mutation.
 */
export async function writePsd(
  document: PsdDocument,
  composite: Uint8Array,
  context?: PsdNewDocumentContext
): Promise<Uint8Array> {
  const codec = await loadPsd();
  try {
    return codec.writePsd(document, composite, context);
  } catch (cause) {
    throw new PsdWriteError(cause);
  }
}

/** Complete first-save operands. No identities, clocks, profiles or host facts are invented by the facade. */
export type PsdNewDocumentContext = NonNullable<Parameters<Codec['writePsd']>[2]>;

/** Atomic writer refusal. The binding's original diagnostic remains available as cause. */
export class PsdWriteError extends Error {
  readonly name = 'PsdWriteError';
  /** The document or its caller-owned writer operands failed codec validation. */
  readonly code = 'InvalidDocument' as const;

  /** Wraps a codec refusal without losing its message or original exception. */
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

/**
 * Reads persisted styles, vector authoring data, locks, labels and metadata without renderer admission.
 * Null leaves remain absent; vector frame queries carry their own refusal reasons. Record indices change
 * after structural edits. This parses the complete supplied file and throws for unreadable input.
 */
export async function readPsdSource(bytes: ArrayBuffer | Uint8Array): Promise<PsdSourceSnapshot> {
  const codec = await loadPsd();
  return codec.readPsdSource(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

/** Persisted source data, including lossless vector carriers and bounded frame queries. */
export type PsdSourceSnapshot = ReturnType<Codec['readPsdSource']>;

/**
 * Reads imported comps, global angle, pixel aspect ratio and bounded File Info leaves.
 * Missing angle/aspect use 30/1; refused carriers return null with reasons in `refusals`.
 * Source bytes remain authoritative for saving; comp selection is never inferred.
 * This parses the complete supplied file and throws for unreadable input.
 */
export async function readPsdMetadataQueries(bytes: ArrayBuffer | Uint8Array): Promise<PsdMetadataQueries> {
  const codec = await loadPsd();
  return codec.readPsdMetadataQueries(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

/** Imported metadata with independent carrier and File Info field refusals. */
export type PsdMetadataQueries = ReturnType<Codec['readPsdMetadataQueries']>;

/**
 * Loads and initializes the codec once; concurrent calls share the work and a failed attempt can be retried.
 * Browsers fetch the adjacent `.wasm` asset, Node reads it from disk. `input` overrides the module source.
 */
export function loadPsd(input?: WasmInput): Promise<Codec> {
  pending ??= import('../wasm/photoshop_psd_wasm.js')
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

/** The generated bindings. */
type Codec = typeof import('../wasm/photoshop_psd_wasm.js');

/** What the bindings accept as the WebAssembly module: a URL, a response, bytes or a compiled module. */
type WasmInput = NonNullable<Parameters<Codec['default']>[0]>;

let pending: Promise<Codec> | undefined;

/** Under Node, which cannot fetch `file:` URLs, the module's bytes; in browsers `undefined`, to fetch it. */
async function nodeModuleBytes(): Promise<Uint8Array | undefined> {
  const node = (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node;
  if (!node) {
    return undefined;
  }

  // Computed specifiers keep bundlers from emitting the asset twice or resolving a Node module for the browser.
  const path = '../wasm/photoshop_psd_wasm_bg.wasm';
  const fs = 'node:fs/promises';
  const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile: (url: URL) => Promise<Uint8Array> };
  return readFile(new URL(path, import.meta.url));
}
