import initWasm, { Archive, parse_document, write_document, read_library, compose_document, resolve_resources, decode_resource, create_computed, decode_sample, } from "../pkg/photoshop_abr_wasm.js";
export { percent, degrees, pixels } from "./brands.js";
/** Initializes the WASM runtime once. With no argument, loads the adjacent .wasm URL.
 * Node callers can pass bytes from fs.readFile; workers initialize their own runtime. */
export async function initAbr(input) {
    initialization ??= initWasm(input === undefined ? undefined : { module_or_path: input })
        .then(() => undefined)
        .catch((error) => {
        initialization = undefined;
        throw error;
    });
    await initialization;
}
/** Parses bytes into readable fields and an owned, transferable source copy.
 * Requires initAbr. Errors are exceptions; partial parses are not silently returned. */
export function parseAbr(input) {
    return parse_document(inputBytes(input));
}
/** Patches existing readable fields, preserving original ID encoding and every
 * untouched value. Unchanged documents return an exact byte copy. Rejects reordering,
 * resource edits, class changes and ambiguous keys. Does not change the input object. */
export function writeAbr(document) {
    assertPortable(document);
    return write_document(document);
}
/** Creates a new set of computed brushes without a source file, then returns the same portable model. */
export function createAbr(brushes) {
    const input = brushes.map((b) => {
        const item = record(b), tip = record(item.tip);
        if (Object.keys(item).some((k) => !["name", "tip"].includes(k)) ||
            Object.keys(tip).some((k) => ![
                "kind",
                "diameter",
                "hardness",
                "roundness",
                "angle",
                "spacing",
                "spacingEnabled",
            ].includes(k)))
            throw new Error("Unknown computed brush property");
        if (b.tip.kind !== "computed")
            throw new TypeError("createAbr currently constructs computed tips");
        return { name: b.name, ...b.tip };
    });
    return parseAbr(create_computed(input));
}
/** Reads a plane from a resource index. Slot 55 is the usual sample mask; patterns use 0..N. */
export function readPlane(document, resource, slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 65535)
        throw new RangeError("Invalid plane slot");
    if (!document.resources.some((r) => r.section === resource.section &&
        r.index === resource.index &&
        r.kind === resource.kind &&
        r.id === resource.id))
        throw new Error("Resource is not part of this document");
    const archive = new Archive(document.source.bytes);
    try {
        return planeResult(archive.plane(resource.section, resource.index, slot));
    }
    finally {
        archive.free();
    }
}
/** Raw standalone sample payload for binary inspection; excludes its u32 length and padding. */
export function sampleBytes(document, resource) {
    if (resource.kind !== "sample")
        throw new Error("Expected a sample");
    if (!document.resources.some((r) => r.section === resource.section &&
        r.index === resource.index &&
        r.id === resource.id &&
        r.kind === resource.kind))
        throw new Error("Resource is not part of this document");
    const archive = new Archive(document.source.bytes);
    try {
        return archive.sample_bytes(resource.section, resource.index);
    }
    finally {
        archive.free();
    }
}
/** Decodes an independent sample payload. This replaces the old sample reader's
 * mistaken Pascal terminator handling and supports sample layouts 1 and 2. */
export function readSamplePlane(bytes, sampleLayout) {
    if (sampleLayout !== 1 && sampleLayout !== 2)
        throw new RangeError("Expected sample layout 1 or 2");
    const decoded = decode_sample(bytes, sampleLayout), value = record(decoded);
    if (!(value.id instanceof Uint8Array))
        throw new Error("Unexpected WASM sample result");
    return { id: byteString(value.id), plane: planeResult(value.plane) };
}
function planeResult(result) {
    const r = record(result), info = record(r.info);
    if (!(r.data instanceof Uint8Array) ||
        typeof r.raw !== "boolean" ||
        !Array.isArray(info.bounds) ||
        info.bounds.length !== 4 ||
        !info.bounds.every((v) => typeof v === "number") ||
        typeof info.depth !== "number")
        throw new Error("Unexpected WASM plane ABI");
    const bounds = info.bounds;
    return {
        width: bounds[3] - bounds[1],
        height: bounds[2] - bounds[0],
        bounds,
        depth: info.depth,
        data: r.data,
        raw: r.raw,
    };
}
function inputBytes(input) {
    return input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}
/** Reject cycles and nonportable objects before recursive comparisons or WASM calls. */
function assertPortable(value, parents = new Set(), depth = 0) {
    if (depth > 128)
        throw new Error("Portable document nesting limit");
    if (value === null || typeof value !== "object") {
        if (typeof value === "function" || typeof value === "symbol")
            throw new TypeError("Nonportable document value");
        return;
    }
    if (value instanceof Uint8Array)
        return;
    if (parents.has(value))
        throw new TypeError("Cyclic document");
    if (!Array.isArray(value) &&
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
        throw new TypeError("Expected a portable plain object");
    parents.add(value);
    for (const child of Object.values(value))
        assertPortable(child, parents, depth + 1);
    parents.delete(value);
}
/** Resolves resources for the current readable settings, including unsaved edits. */
export function resolveResources(resources, brush) {
    return resolve_resources(resources, brush);
}
/** Copies one compressed resource into an independent transferable object. */
export function resourceSource(document, resource) {
    const archive = new Archive(document.source.bytes);
    try {
        return archive.resource_source(resource);
    }
    finally {
        archive.free();
    }
}
/** Decodes one resource. The byte budget is checked before normalized pixel allocation. */
export function decodeResource(source, maxDecodedBytes = 268_435_456) {
    if (!Number.isSafeInteger(maxDecodedBytes) ||
        maxDecodedBytes < 0 ||
        maxDecodedBytes > 268_435_456)
        throw new RangeError("Image byte budget must be in 0..268435456");
    return decode_resource(source, maxDecodedBytes);
}
function record(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TypeError("Expected object");
    return value;
}
function byteString(bytes) {
    return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}
/** Parses once and prepares primary sample masks within an aggregate byte budget. */
export function readLibrary(input, maxDecodedBytes = 268_435_456) {
    if (!Number.isSafeInteger(maxDecodedBytes) ||
        maxDecodedBytes < 0 ||
        maxDecodedBytes > 4294967295)
        throw new RangeError("Invalid library image byte budget");
    return read_library(inputBytes(input), maxDecodedBytes);
}
/** Writes an explicitly arranged library. Conflicting resource IDs and mixed sample layouts throw. */
export function composeAbr(composition) {
    assertPortable(composition);
    return compose_document(composition);
}
let initialization;
