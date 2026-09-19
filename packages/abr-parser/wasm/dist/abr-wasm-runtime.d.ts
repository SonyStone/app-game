import { type InitInput } from "../pkg/photoshop_abr_wasm.js";
import type { Brush, ReadableObject } from "./model.js";
import type { Pixels, Percent, Degrees } from "./brands.js";
export { percent, degrees, pixels } from "./brands.js";
export type { Percent, Degrees, Pixels } from "./brands.js";
export type * from "./model.js";
/** Portable source envelope; all original bytes survive structuredClone/postMessage.
 * Treat it as immutable. It contains the entire file, including unprojected fields. */
export interface AbrSource {
    readonly format: "photoshop-abr/v1";
    readonly bytes: Uint8Array;
}
/** Lightweight resource index. Pixels are decoded through readPlane only when needed. */
export interface Resource {
    readonly kind: "sample" | "pattern";
    /** Original resource identifier without normalization. */
    readonly id: string;
    readonly name?: string;
    /** Positional address, local to this source file. */
    readonly section: number;
    readonly index: number;
    readonly colorMode: number;
    readonly colorChannels?: number;
    readonly planes: readonly {
        readonly slot: number;
        readonly bounds: readonly [number, number, number, number];
        readonly depth: number;
    }[];
}
/** Readable document. Existing preset fields are editable; structure and resource
 * indexes are read-only in v1. Unsupported edits throw instead of losing data. */
export interface AbrDocument {
    readonly version: number;
    readonly sampleLayout: number;
    brushes: Brush[];
    /** Stored hierarchy markers, with readable group names. */
    readonly hierarchy: readonly ReadableObject[];
    readonly resources: readonly Resource[];
    /** Root descriptor data not represented by brushes/hierarchy, retained for inspection. */
    readonly extensions: readonly unknown[];
    readonly source: AbrSource;
}
/** Complete computed-tip input. Brands describe units; write-time checks enforce ranges. */
export interface ComputedBrushInput {
    name: string;
    tip: {
        kind: "computed";
        diameter: Pixels;
        hardness: Percent;
        roundness: Percent;
        angle: Degrees;
        spacing: Percent;
        spacingEnabled: boolean;
    };
}
/** Initializes the WASM runtime once. With no argument, loads the adjacent .wasm URL.
 * Node callers can pass bytes from fs.readFile; workers initialize their own runtime. */
export declare function initAbr(input?: InitInput | Promise<InitInput>): Promise<void>;
/** Parses bytes into readable fields and an owned, transferable source copy.
 * Requires initAbr. Errors are exceptions; partial parses are not silently returned. */
export declare function parseAbr(input: ArrayBuffer | ArrayBufferView): AbrDocument;
/** Patches existing readable fields, preserving original ID encoding and every
 * untouched value. Unchanged documents return an exact byte copy. Rejects reordering,
 * resource edits, class changes and ambiguous keys. Does not change the input object. */
export declare function writeAbr(document: AbrDocument): Uint8Array;
/** Creates a new set of computed brushes without a source file, then returns the same portable model. */
export declare function createAbr(brushes: readonly ComputedBrushInput[]): AbrDocument;
/** One decoded plane, retaining storage depth and byte order instead of inventing coverage. */
export interface Plane {
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    readonly bounds: readonly [number, number, number, number];
    /** Raw storage bytes, or PackBits-decoded bytes. */
    readonly data: Uint8Array;
    /** True when every strip was raw. High-depth PackBits has different native endian handling. */
    readonly raw: boolean;
}
/** Reads a plane from a resource index. Slot 55 is the usual sample mask; patterns use 0..N. */
export declare function readPlane(document: AbrDocument, resource: Resource, slot: number): Plane;
/** Raw standalone sample payload for binary inspection; excludes its u32 length and padding. */
export declare function sampleBytes(document: AbrDocument, resource: Resource): Uint8Array;
/** Decodes an independent sample payload. This replaces the old sample reader's
 * mistaken Pascal terminator handling and supports sample layouts 1 and 2. */
export declare function readSamplePlane(bytes: Uint8Array, sampleLayout: number): {
    id: string;
    plane: Plane;
};
/** Self-contained compressed image source. Its byte buffer never contains the enclosing archive. */
export type ResourceSource = {
    readonly kind: "sample";
    readonly layout: number;
    readonly bytes: Uint8Array;
} | {
    readonly kind: "pattern";
    readonly mode: number;
    readonly bytes: Uint8Array;
    readonly palette?: Uint8Array;
};
/** Deterministic coverage texture. Source depth is retained for inspection. */
export interface Image {
    readonly width: number;
    readonly height: number;
    readonly depth: 8;
    readonly sourceDepth: number;
    readonly data: Uint8Array;
}
/** References resolved by Rust, including diagnostics for absent embedded resources. */
export interface ResourceSelection {
    readonly sample?: Resource;
    readonly dualSample?: Resource;
    readonly pattern?: Resource;
    readonly warnings: readonly string[];
}
/** Resolves resources for the current readable settings, including unsaved edits. */
export declare function resolveResources(resources: readonly Resource[], brush: Brush): ResourceSelection;
/** Copies one compressed resource into an independent transferable object. */
export declare function resourceSource(document: AbrDocument, resource: Resource): ResourceSource;
/** Decodes one resource. The byte budget is checked before normalized pixel allocation. */
export declare function decodeResource(source: ResourceSource, maxDecodedBytes?: number): Image;
/** One independently transferable resource with its source-file address. */
export interface EmbeddedResource {
    readonly resource: Resource;
    readonly source: ResourceSource;
}
/** An editor-ready library; images are shared by positional resource address. */
export interface Library {
    readonly document: AbrDocument;
    readonly resources: readonly EmbeddedResource[];
    readonly images: readonly {
        readonly section: number;
        readonly index: number;
        readonly image: Image;
    }[];
    readonly selections: readonly ResourceSelection[];
    readonly errors: readonly string[];
}
/** Parses once and prepares primary sample masks within an aggregate byte budget. */
export declare function readLibrary(input: ArrayBuffer | ArrayBufferView, maxDecodedBytes?: number): Library;
/** Explicit reconstruction for selection, reordering and folders. Source resources are retained. */
export interface Composition {
    sources: readonly AbrSource[];
    brushes: readonly {
        source: number;
        preset: Brush;
    }[];
    hierarchy: readonly {
        kind: "group" | "groupEnd" | "preset";
        name?: string;
        uuid?: string;
    }[];
}
/** Writes an explicitly arranged library. Conflicting resource IDs and mixed sample layouts throw. */
export declare function composeAbr(composition: Composition): Uint8Array;
