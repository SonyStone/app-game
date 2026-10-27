let wasm;

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_export_2.set(idx, obj);
    return idx;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let WASM_VECTOR_LEN = 0;

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder('utf-8') : { encode: () => { throw Error('TextEncoder not available') } } );

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_export_2.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
/**
 * Projects measured schema-13/14 horizontal cached engine data into save schema 7 for compatibility
 * comparison. This is a diagnostic candidate. It does not produce local TySh descriptors, validate
 * import/layout state, shape glyphs or authorize editor saves. Missing face-context entries retain
 * document identities. Supply actual face versions, never guesses based only on PostScript names.
 * Unsupported versions, duplicate identities and nonhorizontal cached data throw.
 * @param {Uint8Array} bytes
 * @param {TypeEngineFontVersion[]} fonts
 * @returns {Uint8Array}
 */
export function projectTypeEngineSave26(bytes, fonts) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.projectTypeEngineSave26(ptr0, len0, fonts);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Converts modern horizontal cache origins through the native visual-origin addition before
 * projecting schema 13/14. This converts stored coordinates, never shapes glyphs. Remaining
 * import/layout dependencies still require comparison; no editor admission changes.
 * @param {Uint8Array} bytes
 * @param {TypeEngineFontVersion[]} fonts
 * @returns {Uint8Array}
 */
export function projectTypeEngineGeometry26(bytes, fonts) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.projectTypeEngineGeometry26(ptr0, len0, fonts);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Formats one finite binary32 engine real. Values beyond the measured native magnitude throw.
 * @param {number} value
 * @returns {Uint8Array}
 */
export function formatTypeEngineReal26(value) {
    const ret = wasm.formatTypeEngineReal26(value);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * Writes current engine values using Photoshop 26's binary32 decimals and canonical whitespace.
 * Does not import a layout, resolve fonts or authorize an edited PSD/PSB save. The original bytes
 * remain unchanged. Malformed packets and unsupported scalar/array encodings throw.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array}
 */
export function writeTypeEngineValues26(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.writeTypeEngineValues26(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Converts measured modern major-axis caches and segment indices into schema 7.
 * Vertical caches require zero major origins and retain source layout and glyph IDs. Metric-box
 * rotation uses binary32 arithmetic. Malformed packets, unsupported layouts or font contexts throw.
 * Supply actual face versions as for `projectTypeEngineSave26`. Returns a diagnostic engine packet;
 * it does not shape text, compute vertical font geometry or authorize edited saves.
 * @param {Uint8Array} bytes
 * @param {TypeEngineFontVersion[]} fonts
 * @returns {Uint8Array}
 */
export function projectTypeEngineLayoutCache26(bytes, fonts) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.projectTypeEngineLayoutCache26(ptr0, len0, fonts);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Converts measured horizontal SelectionPoints and positioned origins into legacy pen and mark
 * arrays, including a supplied uniform shadow scale for strike descent. This imports source
 * caches. It does not shape text, reconstruct missing font context, or authorize edited saves.
 * @param {Uint8Array} bytes
 * @param {TypeEngineFontVersion[]} fonts
 * @returns {Uint8Array}
 */
export function projectTypeEngineSelection26(bytes, fonts) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.projectTypeEngineSelection26(ptr0, len0, fonts);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

let cachedUint16ArrayMemory0 = null;

function getUint16ArrayMemory0() {
    if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
        cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachedUint16ArrayMemory0;
}

function passArray16ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 2, 2) >>> 0;
    getUint16ArrayMemory0().set(arg, ptr / 2);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedUint32ArrayMemory0 = null;

function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedFloat32ArrayMemory0 = null;

function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}
/**
 * Accumulates nominal hmtx advances with explicit shaped design adjustments and point spacing.
 * Supply glyph IDs, signed design-unit adjustments and point spacing with equal lengths, plus a
 * size in 0.5..=32767 points. Returns one binary32 point pen per glyph and a terminal pen, starting
 * at zero. Base and spacing sums accumulate separately. Invalid operands or font programs throw.
 * Does not perform shaping, kerning, host font lookup or choose terminal tracking or save admission.
 * @param {Uint8Array} bytes
 * @param {number} face_index
 * @param {Uint16Array} glyphs
 * @param {number} size
 * @param {Int32Array} adjustments
 * @param {Float32Array} spacing
 * @returns {Float32Array}
 */
export function computeTypeHorizontalPens26(bytes, face_index, glyphs, size, adjustments, spacing) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray16ToWasm0(glyphs, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray32ToWasm0(adjustments, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArrayF32ToWasm0(spacing, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.computeTypeHorizontalPens26(ptr0, len0, face_index, ptr1, len1, size, ptr2, len2, ptr3, len3);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v5 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v5;
}

/**
 * Computes ordinary TrueType box/point baselines from supplied bytes and explicit manual leading.
 * The caller establishes line breaks; `count` is at most 1,000,000 and `leading` is finite/positive.
 * Size must be in 0.5..=32767 points.
 * Box text starts at the normalized lowercase-d baseline; point text starts at zero. Returns local
 * binary32 point coordinates. Invalid operands, missing markers and unsupported contexts throw.
 * Does not choose automatic leading, shape text, query host fonts or authorize edited saves.
 * @param {Uint8Array} bytes
 * @param {number} face_index
 * @param {number} size
 * @param {number} leading
 * @param {number} count
 * @param {boolean} boxed
 * @returns {Float32Array}
 */
export function computeTypeManualBaselines26(bytes, face_index, size, leading, count, boxed) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.computeTypeManualBaselines26(ptr0, len0, face_index, size, leading, count, boxed);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v2;
}

/**
 * Reads native-normalized OS/2 metric words from explicit static TrueType bytes.
 * Returns typo ascent/descent/gap, cap and x-height, with absent fields represented as null.
 * @param {Uint8Array} bytes
 * @param {number} face_index
 * @returns {any}
 */
export function readTypeFontMetrics26(bytes, face_index) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.readTypeFontMetrics26(ptr0, len0, face_index);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Computes local y-down ink from exact supplied font bytes and already positioned glyph IDs.
 * Standard TrueType hinting only. Missing fonts, variable/CFF faces, nonfinite values and
 * unsupported outline programs throw. Does not shape text or authorize a document save.
 * @param {TypeGlyphFont26[]} fonts
 * @param {TypePositionedGlyph26[]} glyphs
 * @param {number} tx
 * @param {number} ty
 * @returns {Float32Array}
 */
export function computeTypeGlyphInk26(fonts, glyphs, tx, ty) {
    const ret = wasm.computeTypeGlyphInk26(fonts, glyphs, tx, ty);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
}

/**
 * Computes supplied-font ink and returns a complete diagnostic TySh candidate in explicit
 * points units. Supply `unitsPerPixel = 72 / resolution`. Other import/layout properties remain
 * source-dependent; a returned packet is not an editor admission certificate.
 * @param {Uint8Array} bytes
 * @param {TypeGlyphFont26[]} fonts
 * @param {TypePositionedGlyph26[]} glyphs
 * @param {number} units_per_pixel
 * @returns {Uint8Array}
 */
export function writeTypeLayerGlyphs26(bytes, fonts, glyphs, units_per_pixel) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.writeTypeLayerGlyphs26(ptr0, len0, fonts, glyphs, units_per_pixel);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Writes an 8-bit RGB document of `document.layers` and the straight RGBA `composite`; PSB above 30000
 * pixels on a side. Without context, records carry bottom-to-top IDs beginning at 2.
 * Explicit context supplies IDs/clocks and initializes root XMP/history, host resources and document state.
 * Resource 1044 carries the largest allocated ID. Inputs and existing preservation saves remain unchanged.
 * @param {any} document
 * @param {Uint8Array} composite
 * @param {any} context
 * @returns {Uint8Array}
 */
export function writePsd(document, composite, context) {
    const ptr0 = passArray8ToWasm0(composite, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.writePsd(document, ptr0, len0, context);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Reads the raster layers of an RGB, Grayscale or Bitmap PSD or PSB at any depth, groups flattened.
 * @param {Uint8Array} bytes
 * @returns {any}
 */
export function readPsd(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.readPsd(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Rasterizes one upright stem-free CFF2 glyph with Strong AA at 13.375..47.5625 px.
 * The caller supplies actual single-face OTTO font bytes, a complete signed 16.16 design tuple
 * in fvar order and a finite baseline origin within +/-100000 pixels. Font input is at most 64 MiB.
 * No font lookup, shaping, HVAR or paint occurs.
 * Hints, masks, flex/arithmetic programs, multiple FDs, transforms and other AA methods refuse.
 * Returns coverage and document-space bounds only. This does not admit CFF2 to addTextFont or SetText.
 * @param {Uint8Array} font_bytes
 * @param {readonly number[]} design_coordinates
 * @param {string} character
 * @param {number} size
 * @param {number} origin_x
 * @param {number} origin_y
 * @returns {PsdCff2Coverage}
 */
export function rasterizeCff2Strong(font_bytes, design_coordinates, character, size, origin_x, origin_y) {
    const ptr0 = passArray8ToWasm0(font_bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.rasterizeCff2Strong(ptr0, len0, design_coordinates, character, size, origin_x, origin_y);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}
/**
 * Write one saved-history event using explicit retained metadata state.
 * If retained_instance_id matches the final event's instanceID, updates only action,
 * instanceID, when and softwareAgent. Otherwise appends a saved event. Earlier events
 * and unrelated fields survive. Omit retained_instance_id for an empty retained state.
 * After success the caller retains context.instanceId for the next writer call.
 * Returns independent XMP bytes and never mutates a session. This is a writer primitive,
 * not a save certificate: longer histories still refuse editRasterTreeExact because
 * fresh save-copy import does not yet establish the retained state. No clock or ID is
 * generated. Invalid native element-form XMP or context throws TypeError.
 * @param {Uint8Array} xmp
 * @param {PsdPhotoshop26SaveContext} context
 * @param {string | null} [retained_instance_id]
 * @returns {Uint8Array}
 */
export function writeSavedHistory(xmp, context, retained_instance_id) {
    const ptr0 = passArray8ToWasm0(xmp, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(retained_instance_id) ? 0 : passStringToWasm0(retained_instance_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.writeSavedHistory(ptr0, len0, context, ptr1, len1);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * Check prepared native-layout bytes under the closed Photoshop 26 v1 contract.
 * Throws on unsupported metadata layouts. A false result grants no save certificate.
 * @param {Uint8Array} left
 * @param {Uint8Array} right
 * @returns {any}
 */
export function checkPhotoshop26Save(left, right) {
    const ptr0 = passArray8ToWasm0(left, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(right, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.checkPhotoshop26Save(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Generate an independent baseline JPEG in Photoshop 26's resource-1036 envelope.
 * Complete sRGB8 RGBA canvas pixels and explicit resolution are required. Resizing
 * refuses. This proves thumbnail generation only, never editor-save equivalence.
 * @param {number} width
 * @param {number} height
 * @param {number} resolution
 * @param {Uint8Array} rgba
 * @returns {Uint8Array}
 */
export function generatePhotoshop26Thumbnail(width, height, resolution, rgba) {
    const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.generatePhotoshop26Thumbnail(width, height, resolution, ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Reads persisted styles, vectors, locks, labels, metadata and XMP without renderer admission.
 * Vector frame queries are separate from stored values and report malformed-name/rectangle refusals.
 * Optional fields are null when absent or differently tagged. Unknown descriptor leaves stay in sourceBlock.
 * Physical record indices refer to the selected layer-info section and change after structural edits.
 * @param {Uint8Array} bytes
 * @returns {PsdSourceSnapshot}
 */
export function readPsdSource(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.readPsdSource(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Reads the bounded J-metadata query model. Missing scalars use confirmed defaults 30 and 1.
 * Refused carriers return null plus an explicit reason. File Info may contain independently
 * admitted fields and field-specific refusals. This does not edit source, infer comp selection,
 * reconcile copyright or normalize a document for saving.
 * @param {Uint8Array} bytes
 * @returns {PsdMetadataQueries}
 */
export function readPsdMetadataQueries(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.readPsdMetadataQueries(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

const PsdAllocationContextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_psdallocationcontext_free(ptr >>> 0, 1));
/**
 * Shared conservative account for explicit editor rename transactions.
 * Existing document models, supplied assets, batch strings and JS/WASM copies belong in retainedBytes.
 * Charges never refund. The first allocation/live refusal persists until this handle is freed.
 * Other editor operations and browser transfers do not automatically use this account.
 */
export class PsdAllocationContext {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PsdAllocationContextFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_psdallocationcontext_free(ptr, 0);
    }
    /**
     * Cumulative admitted storage including the baseline, even after results are dropped or a call fails.
     * @returns {bigint}
     */
    get retainedBytes() {
        const ret = wasm.psdallocationcontext_retainedBytes(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Creates an opt-in account with the WASM32 defaults and a caller-supplied retained baseline.
     * Limits govern audited payload/capacity charges, without an OS RSS or whole-program guarantee.
     * @param {PsdBudgetOptions | undefined} options
     */
    constructor(options) {
        const ret = wasm.psdallocationcontext_new(options);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        PsdAllocationContextFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}

const PsdEditorSessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_psdeditorsession_free(ptr >>> 0, 1));
/**
 * Persistent source-preserving editor. Opening does not fetch assets or flatten the document.
 * Native process edits additionally admit bounded Gray8/16, RGB16/32 and CMYK8 products.
 * RGB8 plain raster/group edits are atomic; unsupported dependencies throw structured Error objects.
 * Visual saves require the strict renderer, regenerate merged data and omit thumbnail 1036.
 */
export class PsdEditorSession {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PsdEditorSessionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_psdeditorsession_free(ptr, 0);
    }
    /**
     * Moves/scales the sole smart layer or replaces its embedded PNG atomically. Requires one opaque raster
     * backdrop and one unfiltered Normal smart layer in unprofiled RGB8, at integer upright in-canvas bounds.
     * setSmartAxisTransform requires a fresh placementId and explicit nearestNeighbor or bilinear interpolation.
     * Bilinear retains at least half of each source axis, or reduces both into exact power-of-two bins
     * of at least four samples. Cubic scaling requires unavailable table state.
     * Replacement must have the same dimensions, positive alpha and fresh distinct host-generated UUIDs.
     * Updates SoLd/PlLd, linked bytes and lengths, parent channels/bounds and real merged data; omits thumbnails.
     * External/shared contents, filters and unsupported dependencies throw Dependency with propertyPath.
     * duplicateSmart, applySmartComp, appendSmartFilter and updateSmartLink always refuse with named paths;
     * native authoring observations alone do not certify their dependent editor writes.
     * Failure preserves bytes and revision. linearBlending is the host gamma-1 preference, false by default.
     * @param {PsdSmartEdit} edit
     * @param {boolean | null} [linear_blending]
     * @returns {M01EditOutcome}
     */
    editSmart(edit, linear_blending) {
        const ret = wasm.psdeditorsession_editSmart(this.__wbg_ptr, edit, isLikeNone(linear_blending) ? 0xFFFFFF : linear_blending ? 1 : 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Atomically edits persisted locks, labels, copy flags, style UI flags and existing percent opacity.
     * Locks change the modern source word; later legacy aliases and Background defaults remain independent.
     * Style dialog edits change the stored flag; native import may force effective visibility true.
     * Record indices come from inspectSource and change after structural edits. Opacity edits require
     * strict merged-image regeneration at prepareSave; unsupported rendering refuses the save.
     * Visual edits admit RGB8 primary layers on canvases at most 2000x1000. Labels must be in 0..11.
     * Color Overlay edits admit one enabled singleton Normal RGB effect on flat unmasked RGB8 raster layers,
     * synchronize existing legacy companions, and require strict prepareSave regeneration.
     * Arbitrary shmd/XMP replacement, other colors, nested paint edits and runtime state refuse.
     * @param {readonly PsdSourceEdit[]} batch
     * @returns {M01EditOutcome}
     */
    editSource(batch) {
        const ret = wasm.psdeditorsession_editSource(this.__wbg_ptr, batch);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Selects a comp for application UI only. Null clears selection; no bytes/revision change.
     * Requires a unique existing comp ID and unambiguous layer IDs. Does not apply pixels or set lastAppliedComp.
     * @param {number | null} [id]
     */
    selectComp(id) {
        const ret = wasm.psdeditorsession_selectComp(this.__wbg_ptr, !isLikeNone(id), isLikeNone(id) ? 0 : id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Applies native-plane replacement, opacity and rename commands atomically in Gray8/16, RGB16/32 or CMYK8.
     * moveProcessLayer translates only alpha-tight canonical RGB16 rasters on the fixed PSD/PSB canvas.
     * IDs and bounds come from inspectProcess. Planes are complete big-endian native wire samples,
     * process channels first and alpha last; CMYK is inverted. No RGBA8 conversion occurs.
     * Requires explicit host gamma context, flat Normal rasters, measured native defaults and bounded samples.
     * RGB32 colors must be finite and alpha in 0..1. Masks, groups, generators, extra channels,
     * unsupported HDR views and unknown active dependencies throw named errors without changing revision.
     * Successful changes regenerate merged data, order depth markers before layers and remove previews.
     * @param {readonly PsdProcessEdit[]} batch
     * @param {boolean} linear_blending
     * @returns {M01EditOutcome}
     */
    editProcess(batch, linear_blending) {
        const ret = wasm.psdeditorsession_editProcess(this.__wbg_ptr, batch, linear_blending);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Freezes preserve-mode bytes for this revision. Untouched output is byte-identical; rename-only saves
     * preserve all other carriers. Visual saves require exact rendering, write real merged data, set 1057 true
     * and omit 1036. Compatibility-off inputs are promoted. Throws RenderRequired with the renderer's cause.
     * Unmodeled auxiliary document planes throw Dependency rather than being replaced by merged alpha.
     * linearBlending is the host gamma-1 RGB setting, false by default; PSD does not store this preference.
     * @param {boolean | null} [linear_blending]
     * @returns {PsdPreparedSave}
     */
    prepareSave(linear_blending) {
        const ret = wasm.psdeditorsession_prepareSave(this.__wbg_ptr, isLikeNone(linear_blending) ? 0xFFFFFF : linear_blending ? 1 : 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PsdPreparedSave.__wrap(ret[0]);
    }
    /**
     * Supply actual active font bytes for SetText. Nothing is loaded from the host automatically.
     * Collection index names the face in the original TTC. This changes no source or revision.
     * @param {Uint8Array} bytes
     * @param {number} face_index
     */
    addTextFont(bytes, face_index) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.psdeditorsession_addTextFont(this.__wbg_ptr, ptr0, len0, face_index);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Atomically edits current effect visibility or an existing opacity-dissolve byte on RGB8 primary
     * canvases up to 2000x1000. Rebuilds real merged pixels strictly using the supplied host gamma.
     * Preserves style/anFX source and unknown fields. Record indices come from inspectSource.
     * Opacity requires flat ordinary rasters without timelines, masks, clipping or generated content.
     * Color dissolve, keyframes, duplicate/malformed carriers and other writer modes refuse atomically.
     * Higher-depth/CMYK/Lab visibility rendering grants no additional edit/save admission.
     * @param {readonly PsdCarrierEdit[]} batch
     * @param {boolean} linear_blending
     * @returns {M01EditOutcome}
     */
    editCarriers(batch, linear_blending) {
        const ret = wasm.psdeditorsession_editCarriers(this.__wbg_ptr, batch, linear_blending);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Applies confirmed mask/channel operations atomically, using physical record indices and persisted alpha IDs.
     * disableRasterMask admits an existing absolute uninverted RGB8 raster source without density/feather records.
     * prepareSave supplies the host linearBlending context and strictly regenerates merged caches.
     * Compound real/vector masks refuse. filterMask requires a version-4 soLD/filterFXStyle carrier and an
     * existing placement-matched entirely white RGB8 bitmap. Density is a byte, feather is pixels, and disabling
     * retains the bitmap. Nonwhite masks refuse.
     * alphaOptions coordinates ASCII/supplementary names and RGB display resources without changing samples or IDs.
     * Missing/ambiguous metadata, spot conversion and runtime allocation refuse. Reinspect after structural edits.
     * @param {readonly PsdChannelEdit[]} batch
     * @returns {M01EditOutcome}
     */
    editChannels(batch) {
        const ret = wasm.psdeditorsession_editChannels(this.__wbg_ptr, batch);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Resizes/translates a root artboard on a fixed canvas, or explicitly applies save-shrinkwrap.
     * RGB8 PSD only, canvas at most 2000x1000, coordinates within +/-2000. Fixed-canvas edits require
     * auto-expand/shrinkwrap off. shrinkwrapArtboards requires both enabled, visible root boards, complete
     * integer origins and bounded raster/group descendants. It rebases the canvas, masks and reference points.
     * Shrinkwrap requires an explicit linearBlending boolean; ordinary saves never invoke it implicitly.
     * Rebuilds merged RGB/alpha strictly and omits stale previews before publishing the revision.
     * Live edits translate one admitted unstroked rectangle and require an explicit blending boolean.
     * Creation and frame replacement retain named typed refusals.
     * A validated zero translation preserves bytes and revision; failures preserve the complete session.
     * linearBlending is the host gamma-1 preference, required for live edits and shrinkwrap.
     * Fixed-canvas board edits default to false.
     * @param {PsdGeometryEdit} edit
     * @param {boolean | null} [linear_blending]
     * @returns {M01EditOutcome}
     */
    editGeometry(edit, linear_blending) {
        const ret = wasm.psdeditorsession_editGeometry(this.__wbg_ptr, edit, isLikeNone(linear_blending) ? 0xFFFFFF : linear_blending ? 1 : 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Builds a read-only CFF1 layout plan using fonts registered with addTextFont.
     * Admits unchanged size/font at size/unitsPerEm = 1/16 for printable ASCII/CR in left Crisp point
     * or Single-line boxes, or exactly one graphic ASCII glyph at unchanged 24 points in point text.
     * Requires zero tracking/baseline and exact source raster regeneration in both domains.
     * Shaping, soft wrapping, negative extents and other dependencies throw. Revision and bytes stay intact.
     * Omits unresolved actual-size ink bounds. This plan cannot be committed by setText or prepareSave.
     * @param {number} layer_id
     * @param {string} text
     * @returns {PsdCffLayoutCachePlan}
     */
    planCffText(layer_id, text) {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.psdeditorsession_planCffText(this.__wbg_ptr, layer_id, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Application-local selection, independent of persisted comp capture flags and lastAppliedComp.
     * @returns {number | undefined}
     */
    get selectedComp() {
        const ret = wasm.psdeditorsession_selectedComp(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] === 0x100000001 ? undefined : ret[0];
    }
    /**
     * Inspects full-precision persisted source fields for any parsed container, without RGB8 tree admission.
     * Null leaves remain absent. Vector authoring includes separate bounded frame queries with explicit refusals.
     * This reads neither linked assets nor application-only state and admits no new vector editing.
     * @returns {PsdSourceSnapshot}
     */
    inspectSource() {
        const ret = wasm.psdeditorsession_inspectSource(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Inspects native mode/depth and physical layer bounds/channel IDs without display conversion.
     * Source inspection alone does not admit an edit. Persistent IDs can be absent in arbitrary files;
     * editProcess validates unique nonzero IDs, complete native planes and every dependency separately.
     * Physical record order and bounds describe the current revision, including earlier transactions.
     * @returns {PsdProcessSource}
     */
    inspectProcess() {
        const ret = wasm.psdeditorsession_inspectProcess(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Copies the current serialized source and its revision for a checked container proposal.
     * Pending visual edits may leave stale caches in this snapshot. This performs no save preparation.
     * The bytes are independent of the session. Serialization and the full JS copy are unbudgeted.
     * @returns {PsdContainerSnapshot}
     */
    sourceSnapshot() {
        const ret = wasm.psdeditorsession_sourceSnapshot(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Changes the existing sole Surface Blur on one identity full-canvas embedded RGB8 PNG.
     * Requires an untagged positive-alpha source and one opaque Normal backdrop, up to 512 per axis.
     * Preserves content identity, PNG/link bytes, quads and source precision. A fresh canonical host
     * placementId updates SoLd and FEid together. Rebuilds FEid input, parent and real merged caches,
     * preserves the raw filter mask and removes stale thumbnails. Repeated edits use the original PNG.
     * Existing Normal/Multiply returns and enabled unlinked white-extended masks admit integer density
     * and feather 0, 0.5 or 2. linearBlending is required host gamma context; it is never inferred.
     * Unknown settings/dependencies, stacks, transformed/shared/external sources, zero alpha and
     * other modes/depths throw. Every failure preserves bytes and revision.
     * @param {PsdSurfaceBlurEdit} settings
     * @param {boolean} linear_blending
     * @returns {M01EditOutcome}
     */
    editSurfaceBlur(settings, linear_blending) {
        const ret = wasm.psdeditorsession_editSurfaceBlur(this.__wbg_ptr, settings, linear_blending);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Renames primary lyid/luni-only raster records through a shared allocation context.
     * Requires unique IDs and no staged semantic state or pending visual work. Other carriers refuse.
     * The context baseline must include the current source, supplied fonts, batch strings and host copies.
     * Bounded serialization, reparse, name storage and final save complete before publishing one revision.
     * Failure preserves source/revision and retains account charges. Allocation/live refusals throw
     * PsdBudgetError and stay sticky across later calls using the same context. No visual edit is admitted.
     * @param {readonly PsdContextRename[]} batch
     * @param {PsdAllocationContext} context
     * @returns {PsdPreparedSave}
     */
    renameInContext(batch, context) {
        _assertClass(context, PsdAllocationContext);
        const ret = wasm.psdeditorsession_renameInContext(this.__wbg_ptr, batch, context.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PsdPreparedSave.__wrap(ret[0]);
    }
    /**
     * Repaints the selected source slot of a sole unmasked, full-strength Normal RGB8 canvas SoCo.
     * recordIndex is the physical index from inspectSource, invalidated by structural edits.
     * color null regenerates the existing source; otherwise three integral RGB8 components are required.
     * Preserves nativeColor/userColor/Clr syntax and inactive values, rebuilding layer and merged caches
     * atomically and removing stale thumbnails. linearBlending is the explicit host gamma-1 operand.
     * Active non-RGB/HDR colors, non-sRGB profiles, shapes, styles, mirrors and multilayer scenes refuse.
     * Type errors and dependency refusals preserve source bytes, pending edits and revision.
     * @param {number} record_index
     * @param {readonly [number, number, number] | null} color
     * @param {boolean} linear_blending
     * @returns {M01EditOutcome}
     */
    repaintSolidFill(record_index, color, linear_blending) {
        const ret = wasm.psdeditorsession_repaintSolidFill(this.__wbg_ptr, record_index, color, linear_blending);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Atomically changes bounded nonvisual metadata, including print captions and authored slice text.
     * Preserves pixels and unrelated carriers; guide edits regenerate both 1092 and 1032.
     * Active credentials, unknown versions, duplicate identities/carriers and other note encodings refuse.
     * printCaption coordinates existing 1083/1011 slots. sliceName admits existing authored v6/v7/v8
     * Unicode names; sliceUrl also coordinates its existing 1054/slic URL association without fetching it.
     * Names are at most 4096 UTF-16 units, URLs 65536; NUL, duplicate/missing carriers and automatic slices refuse.
     * captureCompVisibility recaptures every layer into an existing unique comp on coherent saved flat
     * unmasked RGB8 rasters. IDs, flags, state 0, other domains and current pixels/caches survive.
     * Pending visual/tree edits, masks, styles, type, smart layers and ambiguous state mappings refuse.
     * rasterResolution changes positive exact signed-16.16 ppi without resampling on plain RGB8 PSD rasters.
     * Requires no XMP; coordinates existing 1005, optional 1083/Rslt and one in-place EXIF companion.
     * Source units, unknown bytes and encoded pixels/previews survive. Unsupported companions and
     * text/smart/vector/style/mask/state dependencies refuse; pending visual edits retain strict preparation.
     * fileInfoCopyright admits publicDomain in canonical simple PS26 XMP/IIM/MD5/EXIF with explicit
     * saveContext timestamps and generated identities. Other copyright transitions, File Info titles,
     * scalar XMP intents, automatic slices and general comp/print/resolution dependencies refuse.
     * Pending visual changes still require a strict render on prepareSave. Failure preserves revision/bytes.
     * @param {readonly PsdStateMetadataEdit[]} edits
     * @returns {M01EditOutcome}
     */
    editStateMetadata(edits) {
        const ret = wasm.psdeditorsession_editStateMetadata(this.__wbg_ptr, edits);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Applies an existing visibility-only comp on coherent saved flat unmasked RGB8 rasters.
     * Preserves geometry, appearance and saved states, updates history and regenerates real merged pixels.
     * compId must be a positive persistent i32 identity; capture flags must be 1 or 17.
     * Requires unprofiled source, complete unique comp/state-0 mappings and explicit Boolean gamma.
     * Tracks, masks, child state, other capture domains and pending visual edits throw typed errors,
     * preserving bytes and revision. General applyComp and captureComp remain refused.
     * @param {number} comp_id
     * @param {boolean} linear_blending
     * @returns {M01EditOutcome}
     */
    applyVisibilityComp(comp_id, linear_blending) {
        const ret = wasm.psdeditorsession_applyVisibilityComp(this.__wbg_ptr, comp_id, linear_blending);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Edits and repaints a sole Normal RGB8 Classic canvas GdFl, with all render-input caches removed.
     * Regenerates layer RGB/alpha and real merged caches atomically, omitting stale thumbnail 1036.
     * Empty patch repaints the current descriptor. DitheredGradient and UnsupportedGradientInterpolation
     * are named refusals. Active masks, shapes, styles, additional layers and other modes/depths refuse.
     * @param {number} record_index
     * @param {GradientFillPatch} patch
     * @param {boolean | null} [linear_blending]
     * @returns {M01EditOutcome}
     */
    repaintGradientFill(record_index, patch, linear_blending) {
        const ret = wasm.psdeditorsession_repaintGradientFill(this.__wbg_ptr, record_index, patch, isLikeNone(linear_blending) ? 0xFFFFFF : linear_blending ? 1 : 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Changes existing version-2 Lab or version-3 XYZ settings in the bounded CMYK8/16 two-layer product.
     * recordIndex comes from inspectSource. Requires the measured embedded coated profile,
     * opaque raw source, full strength, absent/default white mask and relative/BPC-on/dither-off context.
     * Rebuilds native merged data and depth carriers before publishing; removes stale previews.
     * Other profiles, identity shortcuts, incompatible Lab/XYZ patches, unknown dependencies and unsupported
     * graphs throw named errors atomically. Omitted patch fields preserve their exact source values.
     * @param {number} record_index
     * @param {PsdCmykPhotoFilterPatch} patch
     * @param {boolean} linear_blending
     * @returns {M01EditOutcome}
     */
    setCmykPhotoFilter(record_index, patch, linear_blending) {
        const ret = wasm.psdeditorsession_setCmykPhotoFilter(this.__wbg_ptr, record_index, patch, linear_blending);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Apply the bounded reopen-equivalent operations documented in the generated JSDoc.
     * v3 carries complete independent source records and resource 1015 byte-identically.
     * Edited group subtrees, ancestor composites and complete sibling clipping chains are dependent.
     * Structural edits with clipping and opaque Fill requiring merged-alpha/resource collapse refuse.
     * Merged pixels and thumbnails always regenerate. V1/v2 admission stays unchanged.
     * v2 compares untouched type with the reopened source and requires explicit text gamma/fonts.
     * Type targets, ancestors and prior source changes refuse before publication.
     * v2 preserves permitted locks, imports empty selection, and handles measured empty groups.
     * Background opacity requires backgroundLayerName; direct Background deletion does not
     * allocate an identity. All failed source/import/cache/writer work rolls back atomically.
     * Background moves and grouping refuse before selection changes or ID allocation.
     * v2 replaceProcessPlanes admits bounded RGB16 Background wire samples with opaque alpha,
     * preserving identity/protection and selecting Background alone. No RGB-to-CMYK conversion occurs.
     * Structural saves privately normalize bounded SoCo, hue2, vogk and grdm fields;
     * unsupported book/profile, gradient and vector/path dependencies retain named refusals.
     * Native mode/depth needs explicit preview conversion operands. Mask source samples,
     * measured retained styles and same-target scalar batches have distinct bounded paths.
     * v2 retains raster group masks, successful unchanged-order moves, full-strength Normal
     * adjustments over partial RGB16/CMYK8 alpha, and process-only Gray8/CMYK8 alpha declarations.
     * Source partial alpha is preserved. Deleting the sole physical raster refuses before save preparation.
     * Writer-backed Multiply expands plain nonempty closed groups; empty groups retain their state.
     * CMYK group Multiply, smart-subtree scalar state, adjustment/non-Normal descendant caches,
     * and unselected hidden raster scalars refuse atomically.
     * A single RGB8 root deletion or empty ungroup leaving an opaque, unmasked full-canvas
     * Background emits the native flat layout, omitting unused patterns and sheet resources.
     * Invalid identities, duplicate resources, unknown or duplicate surviving Background fields,
     * saved paths and unknown document carriers refuse. Other Background-only scopes remain guarded.
     * Standard Gray halftones use the source-derived resource-1012 writer; other dependencies still refuse.
     * Finite fxrp coordinates within ±300000 remain byte-preserved through disposable validation.
     * Restoring active vector paths and Delete beside nested-group siblings refuse atomically.
     * When empty Ungroup clears selection, resource 1024 records the top physical sheet.
     * v3 rebuilds dependent lrFX from a complete version-zero lfx2/lrFX pair on an ordinary
     * layer with unit scale, seven single legacy families, canonical units and RGB colors.
     * Geometry must be finite and nonnegative; repeated families, gradient glows, textured
     * Bevel, foreign colors and incomplete or unknown legacy envelopes retain refusals.
     * Modern descriptors stay intact; dependent lrFX and enclosing Lr16 use canonical padding.
     * v3 validates unchanged layr only on ordinary records, lset only on section markers,
     * and cont only beside a typed adjustment or fill. Published names and name-source tags
     * stay unchanged. Unknown codes refuse; this adds no generated-name setter or path support.
     * v3 group blend additionally admits one full-strength Pass Through group above an opaque
     * full-canvas Normal RGB8/16 base, with direct opaque Normal rasters and full-strength
     * Normal adjustments whose masks are absent or white. Nested/non-Normal/partial-strength
     * graphs keep the complexChildren cache refusal. V1/v2 retain the earlier boundary.
     * v3 RGB16 replacement writes only complete native process streams and existing alpha
     * on a visible ordinary nonempty raster at unchanged bounds. Names, styles, masks,
     * nonprocess streams, siblings and groups remain intact. Hidden RGB16 Fill refuses with
     * save.carriedUntouched.hiddenRasterPixels. Source, strict merged-cache, renderer,
     * dependency-plan and writer checks remain mandatory; no stale-cache bypass is granted.
     * RGB16 Exposure has no layer-count restriction within the supported profile/render graph.
     * RGB16 partial layer opacity admits one Normal Drop Shadow, Inner Glow, Color Overlay
     * or Satin, retaining Fill, mask, geometry and opaque-backdrop guards.
     * Ungroup selects surviving nested headers and leaves in physical order, excluding
     * group ends; the top surviving sheet stays active. Empty/mixed subgroup guards remain.
     * RGB16 type and stale Photo Filter source caches retain their existing refusals.
     * Every refusal preserves source, selection, allocation and revision.
     * Missing context retains the earlier refusal. Success freezes complete prepared bytes.
     * @param {readonly PsdExactRasterTreeEdit[]} batch
     * @param {PsdReopenSaveContext | undefined} context
     * @returns {any}
     */
    editRasterTreeExact(batch, context) {
        const ret = wasm.psdeditorsession_editRasterTreeExact(this.__wbg_ptr, batch, isLikeNone(context) ? 0 : addToExternrefTable0(context));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Requests Photoshop 26 complete save preparation with explicit host operands.
     * Requires every named context field and rejects extras. This research endpoint
     * returns Dependency at save.thumbnail.adobe-jpeg without changing the session.
     * @param {any} context
     * @returns {PsdPreparedSave}
     */
    preparePhotoshop26Save(context) {
        const ret = wasm.psdeditorsession_preparePhotoshop26Save(this.__wbg_ptr, context);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PsdPreparedSave.__wrap(ret[0]);
    }
    /**
     * Prepares a research candidate for photoshop26.reopen-equivalent/v1.
     * Requires explicit save context and per-layer edit times. It supplies no
     * equivalence certificate or new edit admission. RGB8, measured sRGB profile,
     * opaque 72-ppi canvases fitting the native preview without resizing only.
     * Other cases throw a typed dependency and leave the session unchanged.
     * @param {any} context
     * @param {any} layer_times
     * @returns {PsdPreparedSave}
     */
    prepareReopenCandidate(context, layer_times) {
        const ret = wasm.psdeditorsession_prepareReopenCandidate(this.__wbg_ptr, context, layer_times);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PsdPreparedSave.__wrap(ret[0]);
    }
    /**
     * Freezes the same strict save as prepareSave and records the consumed RGB blending operand.
     * Omission assumes encoded blending, false. A supplied Boolean records host input without verifying it.
     * Fonts, text gamma and profiles are not consumed by this operation. Existing save refusals propagate.
     * @param {boolean | null} [linear_blending]
     * @returns {PsdContextualSave}
     */
    prepareSaveWithContext(linear_blending) {
        const ret = wasm.psdeditorsession_prepareSaveWithContext(this.__wbg_ptr, isLikeNone(linear_blending) ? 0xFFFFFF : linear_blending ? 1 : 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Checks a strict serialized proposal against baseRevision and atomically prepares its save.
     * Only canonical names, opacity, locks, labels and existing metadata copy flags are bridged.
     * Every other source byte must match an exact replay. Unaccounted changes throw Dependency;
     * stale revisions throw Invalid. Render, parse and save failures preserve source and revision.
     * linearBlending is the explicit host gamma-1 RGB operand. Use the returned frozen save bytes,
     * which may replace stale proposed caches. Inherited opening caches are not certified.
     * @param {bigint} base_revision
     * @param {Uint8Array} proposed
     * @param {boolean} linear_blending
     * @returns {PsdMutationSave}
     */
    prepareContainerMutation(base_revision, proposed, linear_blending) {
        const ptr0 = passArray8ToWasm0(proposed, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.psdeditorsession_prepareContainerMutation(this.__wbg_ptr, base_revision, ptr0, len0, linear_blending);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Repaints explicit Linear interpolation/style on a sole full-strength Normal RGB8 canvas GdFl.
     * Requires the admitted sampled sRGB profile and Dot Gain 20% working Gray; linearBlending is the
     * host gamma-1 preference, false by default. Empty patch regenerates without using source caches.
     * Preserves straight hidden RGB at zero alpha, rebuilds real merged data and removes stale thumbnails.
     * Other profiles, dither, shapes, masks, effects, extra layers and unknown inputs refuse atomically.
     * @param {number} record_index
     * @param {LinearGradientFillPatch} patch
     * @param {boolean | null} [linear_blending]
     * @returns {M01EditOutcome}
     */
    repaintLinearGradientFill(record_index, patch, linear_blending) {
        const ret = wasm.psdeditorsession_repaintLinearGradientFill(this.__wbg_ptr, record_index, patch, isLikeNone(linear_blending) ? 0xFFFFFF : linear_blending ? 1 : 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Replaces the embedded same-size positive-alpha PNG through one existing identity Surface Blur.
     * Keeps complete filter/blend/mask source state and rebuilds FEid, parent and real merged pixels.
     * Admits unprofiled RGB8, a full-canvas source up to 512 per axis, one opaque Normal backdrop,
     * one enabled valid filter, a Normal/Multiply return and an enabled unlinked white-extended mask.
     * Requires fresh distinct UUIDs and explicit Boolean gamma. Removes stale thumbnails on success.
     * Unknown/shared/linked dependencies throw typed errors, preserving source bytes and revision.
     * @param {PsdSurfaceBlurContents} replacement
     * @param {boolean} linear_blending
     * @returns {M01EditOutcome}
     */
    replaceSurfaceBlurContents(replacement, linear_blending) {
        const ret = wasm.psdeditorsession_replaceSurfaceBlurContents(this.__wbg_ptr, replacement, linear_blending);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Repaints explicit Perceptual interpolation with Linear style on a sole full-strength Normal RGB8 canvas GdFl.
     * Requires the admitted sampled sRGB profile and Dot Gain 20% working Gray; linearBlending is the
     * host gamma-1 preference, false by default. Empty patch regenerates without using source caches.
     * Preserves straight hidden RGB at zero alpha, rebuilds real merged data and removes stale thumbnails.
     * Other profiles, dither, shapes, masks, effects, extra layers and unknown inputs refuse atomically.
     * @param {number} record_index
     * @param {PerceptualGradientFillPatch} patch
     * @param {boolean | null} [linear_blending]
     * @returns {M01EditOutcome}
     */
    repaintPerceptualGradientFill(record_index, patch, linear_blending) {
        const ret = wasm.psdeditorsession_repaintPerceptualGradientFill(this.__wbg_ptr, record_index, patch, isLikeNone(linear_blending) ? 0xFFFFFF : linear_blending ? 1 : 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Prepare resource 1060 from the current source snapshot. No-op preservation is unchanged.
     * Missing identity/import rules or runtime leaves throw without changing revision.
     * The optional initialEvent contains only explicit first-preparation runtime leaves.
     * Embedded-only linked inventory removes Ingredients; external or unresolved content throws.
     * @param {PsdXmpSaveContext} context
     * @returns {PsdPreparedSave}
     */
    preparePhotoshop26XmpCandidate(context) {
        const ret = wasm.psdeditorsession_preparePhotoshop26XmpCandidate(this.__wbg_ptr, context);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PsdPreparedSave.__wrap(ret[0]);
    }
    /**
     * Prepare only researched Photoshop 26 resource products, returning explicit dependencies.
     * Never mutates the session or certifies a complete native save. Preservation saves remain unchanged.
     * @param {PsdSaveResourceContext} context
     * @returns {PsdResourceSaveCandidate}
     */
    preparePhotoshop26ResourceCandidate(context) {
        const ret = wasm.psdeditorsession_preparePhotoshop26ResourceCandidate(this.__wbg_ptr, context);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Opens an in-memory PSD/PSB. Untouched save works for any container the lossless parser accepts.
     * This bounded API does not claim paged input or arbitrary-size PSB support.
     * @param {Uint8Array} bytes
     */
    constructor(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.psdeditorsession_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        PsdEditorSessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Prepare omission of an imported typed empty pths path-list carrier.
     * Preserves every unrelated field and the session revision. Nonempty paths,
     * symmetry state, duplicate carriers and unknown descriptor fields throw.
     * This is a partial document product, not complete native-save certification.
     * Dispose the returned prepared save after reading its chunks.
     * @returns {PsdPreparedSave}
     */
    preparePhotoshop26EmptyPathsCandidate() {
        const ret = wasm.psdeditorsession_preparePhotoshop26EmptyPathsCandidate(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PsdPreparedSave.__wrap(ret[0]);
    }
    /**
     * Prepare one solid RGB8 shape cache from current source geometry and fill.
     * Preserves session revision and every unrelated record, resource and merged cache.
     * Requires a unique positive integer layerId and a version-3, closed, enabled path.
     * Accepts unfeathered, unstroked solid RGB8 shapes with coherent generator carriers,
     * coordinates within ±2000 pixels and at most four million stored pixels.
     * Storage bounds retain Q24 fractions, round outward and add a one-pixel apron;
     * output channels are [-1, 0, 1, 2], with only the generated mask removed.
     * Invalid IDs, independent masks and unsupported fills/geometry throw atomically.
     * The returned PsdPreparedSave supports nextChunk and must be disposed after use.
     * Decoded samples and bounds match the researched domain; compressed bytes may differ.
     * Other layer-record normalization and complete native-save certification remain open.
     * Ordinary prepareSave stays byte-identical and never invokes this operation.
     * @param {number} layer_id
     * @returns {PsdPreparedSave}
     */
    preparePhotoshop26ShapeCacheCandidate(layer_id) {
        const ret = wasm.psdeditorsession_preparePhotoshop26ShapeCacheCandidate(this.__wbg_ptr, layer_id);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PsdPreparedSave.__wrap(ret[0]);
    }
    /**
     * Prepare one physical layer record's bounded Photoshop 26 import/save products.
     * The index is zero-based and includes group markers. The partial candidate
     * normalizes legacy defaults, bounded noise-fill serialization, version-4 embedded
     * smart descriptors with default crop/inactive comp/embedded conversion and supported
     * Gray8 generated masks. It preserves revision and unrelated source bytes and
     * grants no whole-save certificate. Smart compInfo uses cold stored state;
     * Photoshop AM inspection can materialize additional retained comp state.
     * Missing IDs/times are not synthesized.
     * Invalid indices or unsupported products throw without changing the session.
     * Dispose the returned prepared save after reading its chunks.
     * @param {number} physical_index
     * @returns {PsdPreparedSave}
     */
    preparePhotoshop26LayerRecordCandidate(physical_index) {
        const ret = wasm.psdeditorsession_preparePhotoshop26LayerRecordCandidate(this.__wbg_ptr, physical_index);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PsdPreparedSave.__wrap(ret[0]);
    }
    /**
     * Applies a M01Edit array atomically. Positions are bottom to top and moves count after removal.
     * New IDs are returned in insertion order. Group-end IDs cannot be targeted. Names must be control-free
     * and at most 255 UTF-16 units. Invalid values refuse,
     * preserving revision, tree and allocation floor. Clip/unclip must leave a preceding raster base.
     * replacePixels preserves properties and exact straight RGBA, including hidden RGB and off-canvas samples.
     * paintPixels replaces its rectangle exactly and extends bounds; it does not blend brush samples.
     * setMask creates/edits the independent raster source, or removes it with null. With a vector it edits -3
     * and rebuilds combined -2. Disabling a real source beside a vector refuses. Empty outside-white masks remain distinct from deletion.
     * setVectorMask creates/edits/removes one absolute rectangle/ellipse path, keeping raster source independent.
     * setSolid updates RGB8 SoCo and vector generator mirrors plus caches; shape null makes an unbounded fill.
     * Relative/inverted/feathered masks, strokes, live origination and general curves refuse.
     * Shape canvases are at most 2000x1000, coordinates within +/-2000.
     * Groups refuse pixel edits; malformed buffers/extents roll back the complete batch.
     * @param {readonly M01Edit[]} batch
     * @returns {M01EditOutcome}
     */
    edit(batch) {
        const ret = wasm.psdeditorsession_edit(this.__wbg_ptr, batch);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Releases the source/model. Existing prepared saves remain independent. Further session calls throw.
     */
    dispose() {
        wasm.psdeditorsession_dispose(this.__wbg_ptr);
    }
    /**
     * Returns revision as bigint, native canvas dimensions and a stable bottom-to-top raster/group tree.
     * Inspection throws a typed refusal outside admission; untouched save remains available.
     * Dirty inspection checks saving with encoded RGB blending and can allocate a whole-canvas render.
     * @returns {M01Snapshot}
     */
    inspect() {
        const ret = wasm.psdeditorsession_inspect(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Current source revision, including documents outside tree-inspection admission.
     * Reading it performs no render or allocation-heavy source snapshot.
     * @returns {bigint}
     */
    get revision() {
        const ret = wasm.psdeditorsession_revision(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return BigInt.asUintN(64, ret[0]);
    }
    /**
     * Replaces text and optional uniform style in one atomic text-only transaction.
     * Register actual original/requested fonts and the whitespace-marker face with addTextFont first.
     * Supports bounded printable ASCII/CR in left horizontal Crisp point or left/center/right Single-line RGB8 boxes.
     * Fitting Every-line boxes admit terminal aliases with integral size and zero tracking.
     * Two alphabetic words separated by one space may wrap in left/center/right modes when conservative
     * margins force one break. Wrapped style mutations, competing/near-fit breaks and full justification refuse.
     * Center/right require integral font size and zero tracking; non-left point text refuses.
     * Full CFF edits refuse because actual-size ink bounds remain unresolved; planCffText is read-only.
     * Unsupported shaping, mixed styles, negative spacing, overflow and dependencies throw named errors.
     * Mixed raster/type batches remain refused. Font registration changes no revision or source bytes.
     * @param {number} layer_id
     * @param {string} text
     * @param {PsdTextStylePatch | undefined} patch
     * @returns {M01EditOutcome}
     */
    setText(layer_id, text, patch) {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.psdeditorsession_setText(this.__wbg_ptr, layer_id, ptr0, len0, patch);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}

const PsdPreparedSaveFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_psdpreparedsave_free(ptr >>> 0, 1));
/**
 * Frozen M01 in-memory save. Chunk reads bound each returned Uint8Array, not total WASM allocation.
 */
export class PsdPreparedSave {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PsdPreparedSave.prototype);
        obj.__wbg_ptr = ptr;
        PsdPreparedSaveFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PsdPreparedSaveFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_psdpreparedsave_free(ptr, 0);
    }
    /**
     * Returns the next at-most-maxBytes chunk, or undefined at EOF. Accepts 1 through 16 MiB.
     * Bytes are available only after all save checks succeed. Throws after disposal.
     * @param {number} max_bytes
     * @returns {Uint8Array | undefined}
     */
    nextChunk(max_bytes) {
        const ret = wasm.psdpreparedsave_nextChunk(this.__wbg_ptr, max_bytes);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Releases prepared bytes. Further chunk reads throw; repeated disposal is harmless.
     */
    dispose() {
        wasm.psdpreparedsave_dispose(this.__wbg_ptr);
    }
    /**
     * Revision frozen by prepareSave, independent of later edits or session disposal.
     * @returns {bigint}
     */
    get revision() {
        const ret = wasm.psdpreparedsave_revision(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
}

const PsdSourceHandleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_psdsourcehandle_free(ptr >>> 0, 1));
/**
 * A host-owned file with u64 spans. The callback `(offset: bigint, length: number) => Uint8Array`
 * must synchronously read exactly the requested window. In a worker use
 * `new Uint8Array(new FileReaderSync().readAsArrayBuffer(blob.slice(Number(offset), Number(offset)+length)))`.
 * Keep the blob and callback alive until free(). No complete file is copied into WASM.
 */
export class PsdSourceHandle {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PsdSourceHandle.prototype);
        obj.__wbg_ptr = ptr;
        PsdSourceHandleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PsdSourceHandleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_psdsourcehandle_free(ptr, 0);
    }
    /**
     * Lists physical primary layer records and bigint compressed-channel spans without reading pixels.
     * Alternate Lr16/Lr32 carriers currently throw a typed unsupported refusal; savedRegion stays available.
     * Options use PsdBudgetOptions; metadata and JavaScript copies are admitted before publication.
     * @param {PsdBudgetOptions | null | undefined} options
     * @returns {PsdSourceLayer[]}
     */
    layerInfo(options) {
        const ret = wasm.psdsourcehandle_layerInfo(this.__wbg_ptr, options);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Reads native original layer or mask pixels through host-owned source windows.
     * Metadata is indexed per call; compressed streams remain in the file. Primary layer records only.
     * Each channel clips independently; missing channels and alternate carriers throw typed errors.
     * @param {number} index
     * @param {PsdNativeRect} rect
     * @param {Int16Array} ids
     * @param {PsdBudgetOptions | null | undefined} options
     * @returns {PsdNativeRegion}
     */
    layerRegion(index, rect, ids, options) {
        const ptr0 = passArray16ToWasm0(ids, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.psdsourcehandle_layerRegion(this.__wbg_ptr, index, rect, ptr0, len0, options);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Reads selected saved process/alpha/spot planes directly from host file windows at native depth.
     * No whole-file UI buffer or WASM compressed-file copy is needed, including for large RGB16 files.
     * Saved pixels may be stale and retain their matte. Does not validate rows after the window.
     * Options use PsdBudgetOptions; throws typed budget/corruption errors before oversized reads.
     * @param {PsdNativeRect} rect
     * @param {Uint16Array} indices
     * @param {PsdBudgetOptions | null | undefined} options
     * @returns {PsdNativeRegion}
     */
    savedRegion(rect, indices, options) {
        const ptr0 = passArray16ToWasm0(indices, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.psdsourcehandle_savedRegion(this.__wbg_ptr, rect, ptr0, len0, options);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Emits original file bytes in chunks of at most 64 KiB. The callback must consume each
     * Uint8Array before returning. It must not accumulate unaccounted chunks in linear memory.
     * @param {Function} emit
     * @param {PsdBudgetOptions | null | undefined} options
     */
    writeUnchanged(emit, options) {
        const ret = wasm.psdsourcehandle_writeUnchanged(this.__wbg_ptr, emit, options);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Returns native header fields and logical section spans, with bigint offsets/lengths.
     * @returns {any}
     */
    info() {
        const ret = wasm.psdsourcehandle_info(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Reads strict outer envelopes without repairing or materializing inner sections.
     * Default budget is 64 MiB per allocation, 512 MiB live, i64::MAX offsets and depth 64.
     * Options `allocationBytes`, `liveBytes`, `maxOffset`, `maxDepth`, `retainedBytes` override per call.
     * @param {(offset: bigint, length: number) => Uint8Array} read
     * @param {bigint} length
     * @param {PsdBudgetOptions | null | undefined} options
     * @returns {PsdSourceHandle}
     */
    static open(read, length, options) {
        const ret = wasm.psdsourcehandle_open(read, length, options);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PsdSourceHandle.__wrap(ret[0]);
    }
    /**
     * Decodes a channel grid from a payload span without its compression word. Native planar
     * bytes are returned, including packed bits, big-endian words and IEEE payloads. ZIP/RLE
     * rows after the requested region remain unvalidated. Uses the same per-call budget defaults as open().
     * @param {bigint} offset
     * @param {bigint} length
     * @param {number} compression
     * @param {number} width
     * @param {number} rows
     * @param {number} depth
     * @param {boolean} psb
     * @param {number} left
     * @param {number} top
     * @param {number} grid_width
     * @param {number} grid_height
     * @param {number} step
     * @param {PsdBudgetOptions | null | undefined} options
     * @returns {Uint8Array}
     */
    readGrid(offset, length, compression, width, rows, depth, psb, left, top, grid_width, grid_height, step, options) {
        const ret = wasm.psdsourcehandle_readGrid(this.__wbg_ptr, offset, length, compression, width, rows, depth, psb, left, top, grid_width, grid_height, step, options);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_buffer_609cc3eee51ed158 = function(arg0) {
        const ret = arg0.buffer;
        return ret;
    };
    imports.wbg.__wbg_call_7cccdd69e0791ae2 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = arg0.call(arg1, arg2);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_call_833bed5770ea2041 = function() { return handleError(function (arg0, arg1, arg2, arg3) {
        const ret = arg0.call(arg1, arg2, arg3);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_charCodeAt_abe5953e37f4b5a6 = function(arg0, arg1) {
        const ret = arg0.charCodeAt(arg1 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_from_2a5d3e218e67aa85 = function(arg0) {
        const ret = Array.from(arg0);
        return ret;
    };
    imports.wbg.__wbg_get_67b2ba62fc30de12 = function() { return handleError(function (arg0, arg1) {
        const ret = Reflect.get(arg0, arg1);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_get_b9b93047fe3cf45b = function(arg0, arg1) {
        const ret = arg0[arg1 >>> 0];
        return ret;
    };
    imports.wbg.__wbg_instanceof_Uint8Array_17156bcf118086a9 = function(arg0) {
        let result;
        try {
            result = arg0 instanceof Uint8Array;
        } catch (_) {
            result = false;
        }
        const ret = result;
        return ret;
    };
    imports.wbg.__wbg_isArray_a1eab7e0d067391b = function(arg0) {
        const ret = Array.isArray(arg0);
        return ret;
    };
    imports.wbg.__wbg_keys_5c77a08ddc2fb8a6 = function(arg0) {
        const ret = Object.keys(arg0);
        return ret;
    };
    imports.wbg.__wbg_length_a446193dc22c12f8 = function(arg0) {
        const ret = arg0.length;
        return ret;
    };
    imports.wbg.__wbg_length_d56737991078581b = function(arg0) {
        const ret = arg0.length;
        return ret;
    };
    imports.wbg.__wbg_length_e2d2a49132c1b256 = function(arg0) {
        const ret = arg0.length;
        return ret;
    };
    imports.wbg.__wbg_new_1ab78df5e132f715 = function(arg0, arg1) {
        const ret = new RangeError(getStringFromWasm0(arg0, arg1));
        return ret;
    };
    imports.wbg.__wbg_new_405e22f390576ce2 = function() {
        const ret = new Object();
        return ret;
    };
    imports.wbg.__wbg_new_78feb108b6472713 = function() {
        const ret = new Array();
        return ret;
    };
    imports.wbg.__wbg_new_9fee97a409b32b68 = function(arg0) {
        const ret = new Uint16Array(arg0);
        return ret;
    };
    imports.wbg.__wbg_new_a12002a7f91c75be = function(arg0) {
        const ret = new Uint8Array(arg0);
        return ret;
    };
    imports.wbg.__wbg_new_b08a00743b8ae2f3 = function(arg0, arg1) {
        const ret = new TypeError(getStringFromWasm0(arg0, arg1));
        return ret;
    };
    imports.wbg.__wbg_new_c68d7209be747379 = function(arg0, arg1) {
        const ret = new Error(getStringFromWasm0(arg0, arg1));
        return ret;
    };
    imports.wbg.__wbg_newwithbyteoffsetandlength_d4a86622320ea258 = function(arg0, arg1, arg2) {
        const ret = new Uint16Array(arg0, arg1 >>> 0, arg2 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_newwithbyteoffsetandlength_d97e637ebe145a9a = function(arg0, arg1, arg2) {
        const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_psdpreparedsave_new = function(arg0) {
        const ret = PsdPreparedSave.__wrap(arg0);
        return ret;
    };
    imports.wbg.__wbg_push_737cfc8c1432c2c6 = function(arg0, arg1) {
        const ret = arg0.push(arg1);
        return ret;
    };
    imports.wbg.__wbg_set_65595bdd868b3009 = function(arg0, arg1, arg2) {
        arg0.set(arg1, arg2 >>> 0);
    };
    imports.wbg.__wbg_set_bb8cecf6a62b9f46 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = Reflect.set(arg0, arg1, arg2);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_setname_6df54b7ebf9404a9 = function(arg0, arg1, arg2) {
        arg0.name = getStringFromWasm0(arg1, arg2);
    };
    imports.wbg.__wbindgen_bigint_from_u64 = function(arg0) {
        const ret = BigInt.asUintN(64, arg0);
        return ret;
    };
    imports.wbg.__wbindgen_boolean_get = function(arg0) {
        const v = arg0;
        const ret = typeof(v) === 'boolean' ? (v ? 1 : 0) : 2;
        return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_export_2;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
        ;
    };
    imports.wbg.__wbindgen_is_null = function(arg0) {
        const ret = arg0 === null;
        return ret;
    };
    imports.wbg.__wbindgen_is_object = function(arg0) {
        const val = arg0;
        const ret = typeof(val) === 'object' && val !== null;
        return ret;
    };
    imports.wbg.__wbindgen_is_string = function(arg0) {
        const ret = typeof(arg0) === 'string';
        return ret;
    };
    imports.wbg.__wbindgen_is_undefined = function(arg0) {
        const ret = arg0 === undefined;
        return ret;
    };
    imports.wbg.__wbindgen_memory = function() {
        const ret = wasm.memory;
        return ret;
    };
    imports.wbg.__wbindgen_number_get = function(arg0, arg1) {
        const obj = arg1;
        const ret = typeof(obj) === 'number' ? obj : undefined;
        getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
    };
    imports.wbg.__wbindgen_number_new = function(arg0) {
        const ret = arg0;
        return ret;
    };
    imports.wbg.__wbindgen_string_get = function(arg0, arg1) {
        const obj = arg1;
        const ret = typeof(obj) === 'string' ? obj : undefined;
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
        const ret = getStringFromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedUint16ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('photoshop_psd_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
