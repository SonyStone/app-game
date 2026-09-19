/// <reference lib="esnext.disposable" />
/* tslint:disable */
/* eslint-disable */

/**
 * Temporary native archive. Portable documents contain bytes rather than this handle.
 */
export class Archive {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Parses and validates an archive for a sequence of operations.
     */
    constructor(bytes: Uint8Array);
    /**
     * Applies precise native descriptor operations for diagnostics.
     */
    patch(changes: any): Uint8Array;
    /**
     * Returns a decompressed native plane.
     */
    plane(section: number, index: number, slot: number): any;
    /**
     * Extracts a standalone encoded resource through the native model.
     */
    resource_source(resource: any): any;
    /**
     * Returns an independent native sample record.
     */
    sample_bytes(section: number, index: number): Uint8Array;
    /**
     * Returns a normalized primary mask.
     */
    sample_image(section: number, index: number, max_bytes: number): any;
    /**
     * Returns the raw research snapshot. Public applications use parse_document instead.
     */
    snapshot(): any;
}

/**
 * Writes a selected, explicitly ordered library using Rust's composition rules.
 */
export function compose_document(input: any): Uint8Array;

/**
 * Constructs an independent set of computed brushes, using the checked Rust authoring interface.
 */
export function create_computed(brushes: any): Uint8Array;

/**
 * Decodes one independently transferable resource through the shared native decoder.
 */
export function decode_resource(source: any, max_bytes: number): any;

/**
 * Decodes an independent sample to raw storage bytes.
 */
export function decode_sample(bytes: Uint8Array, layout: number): any;

/**
 * Parses a source archive directly into the Rust-owned readable document model.
 */
export function parse_document(bytes: Uint8Array): any;

/**
 * Loads an editor library in one Rust operation, with shared primary images and lazy auxiliary sources.
 */
export function read_library(bytes: Uint8Array, max_bytes: number): any;

/**
 * Resolves primary, secondary and pattern references in the Rust readable model.
 */
export function resolve_resources(resources: any, brush: any): any;

/**
 * Validates and writes a portable readable document entirely in Rust.
 */
export function write_document(document: any): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_archive_free: (a: number, b: number) => void;
    readonly archive_new: (a: number, b: number) => [number, number, number];
    readonly archive_patch: (a: number, b: any) => [number, number, number, number];
    readonly archive_plane: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly archive_resource_source: (a: number, b: any) => [number, number, number];
    readonly archive_sample_bytes: (a: number, b: number, c: number) => [number, number, number, number];
    readonly archive_sample_image: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly archive_snapshot: (a: number) => [number, number, number];
    readonly compose_document: (a: any) => [number, number, number, number];
    readonly create_computed: (a: any) => [number, number, number, number];
    readonly decode_resource: (a: any, b: number) => [number, number, number];
    readonly decode_sample: (a: number, b: number, c: number) => [number, number, number];
    readonly parse_document: (a: number, b: number) => [number, number, number];
    readonly read_library: (a: number, b: number, c: number) => [number, number, number];
    readonly resolve_resources: (a: any, b: any) => [number, number, number];
    readonly write_document: (a: any) => [number, number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
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
