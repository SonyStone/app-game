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

/** Snapshot of the admitted RGB8 identity tree. Scalars use byte opacity/Fill. */
export interface M01Snapshot { readonly revision: bigint; readonly width: number; readonly height: number; readonly identityFloor: number; readonly saveBlocked: boolean; readonly selected: readonly number[]; readonly layers: readonly M01Layer[]; }
/** Group children are bottom-to-top; endId is reserved and cannot be edited. */
export interface M01Layer { readonly id: number; readonly endId: number | null; readonly name: string; readonly visible: boolean; readonly opacity: number; readonly fill: number; readonly blend: string; readonly clipped: boolean; readonly link: number | null; readonly linkEnabled: boolean | null; readonly children: readonly M01Layer[]; }
/** IDs correspond to insertions in batch order; refusals leave all state unchanged. */
export interface M01EditOutcome { readonly revision: bigint; readonly created: readonly number[]; readonly diagnostics: readonly never[]; }
/** M01 positions are bottom-to-top, measured after removal for moves. All batches are atomic. */
export type M01Edit =
  | {kind: 'insertRaster'; parent?: number | null; index: number; raster: {name: string; left: number; top: number; width: number; height: number; pixels: Uint8Array}}
  | {kind: 'insertGroup'; parent?: number | null; index: number; name: string}
  | {kind: 'delete'; layerId: number}
  | {kind: 'move'; layerId: number; parent?: number | null; index: number}
  | {kind: 'rename'; layerId: number; name: string}
  | {kind: 'visible'; layerId: number; visible: boolean}
  | {kind: 'opacity'; layerId: number; opacity: number}
  | {kind: 'fill'; layerId: number; fill: number}
  | {kind: 'blend'; layerId: number; blend: string}
  | {kind: 'clip'; layerId: number; clipped: boolean};


/**
 * Persistent M01 preserve-mode editor. Opening does not fetch assets or flatten the document.
 * RGB8 plain raster/group edits are atomic; unsupported dependencies throw structured Error objects.
 * Visual or structural edits block prepareSave until cache regeneration is implemented in M02.
 */
export class PsdEditorSession {
  free(): void;
  /**
   * Freezes preserve-mode bytes for this revision. Untouched output is byte-identical; rename-only saves
   * preserve all other carriers. Throws code CachesRequired for any committed visual/structural change.
   * Model-only, native-deferred save and cache regeneration are deliberately unavailable in M01.
   */
  prepareSave(): PsdPreparedSave;
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
   * No host context is consumed because this round does not certify renders or regenerate caches.
   */
  edit(batch: readonly M01Edit[]): M01EditOutcome;
  /**
   * Releases the source/model. Existing prepared saves remain independent. Further session calls throw.
   */
  dispose(): void;
  /**
   * Returns revision as bigint, native canvas dimensions and a stable bottom-to-top raster/group tree.
   * Inspection throws a typed refusal when the import is outside M01 admission; untouched save remains available.
   */
  inspect(): M01Snapshot;
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

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_psdeditorsession_free: (a: number, b: number) => void;
  readonly __wbg_psdpreparedsave_free: (a: number, b: number) => void;
  readonly psdeditorsession_dispose: (a: number) => void;
  readonly psdeditorsession_edit: (a: number, b: any) => [number, number, number];
  readonly psdeditorsession_inspect: (a: number) => [number, number, number];
  readonly psdeditorsession_new: (a: number, b: number) => [number, number, number];
  readonly psdeditorsession_prepareSave: (a: number) => [number, number, number];
  readonly psdpreparedsave_dispose: (a: number) => void;
  readonly psdpreparedsave_nextChunk: (a: number, b: number) => [number, number, number, number];
  readonly psdpreparedsave_revision: (a: number) => bigint;
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
