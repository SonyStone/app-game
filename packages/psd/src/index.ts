// Layered Photoshop documents, read and written by the Rust/WASM codec built in photoshop-analysis/psd-wasm.
import type { PsdDocument } from './psd';

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
 * or a pixel buffer does not match its size.
 */
export async function writePsd(document: PsdDocument, composite: Uint8Array): Promise<Uint8Array> {
  const codec = await loadPsd();
  return codec.writePsd(document, composite);
}

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
