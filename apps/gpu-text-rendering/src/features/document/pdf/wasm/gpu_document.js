let wasm;

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

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedUint32ArrayMemory0 = null;

function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

let cachedFloat64ArrayMemory0 = null;

function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

let cachedFloat32ArrayMemory0 = null;

function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

let WASM_VECTOR_LEN = 0;

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
/**
 * Decodes retained PDF CMYK/YCCK without the inversion applied by browser JPEG readers.
 * @param {Uint8Array} bytes
 * @param {number} width
 * @param {number} height
 * @returns {RasterOutcome}
 */
export function decodeCmykJpeg(bytes, width, height) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.decodeCmykJpeg(ptr0, len0, width, height);
    return RasterOutcome.__wrap(ret);
}

/**
 * Converts locally inside a disposable Worker; expected PDF failures never throw into JS.
 * @param {Uint8Array} bytes
 * @returns {ConvertOutcome}
 */
export function convertPdf(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.convertPdf(ptr0, len0);
    return ConvertOutcome.__wrap(ret);
}

/**
 * Decode synchronously inside a dedicated Worker; cancellation terminates that Worker.
 * @param {Uint8Array} bytes
 * @returns {DecodeOutcome}
 */
export function decodeDocument(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.decodeDocument(ptr0, len0);
    return DecodeOutcome.__wrap(ret);
}

const ConvertOutcomeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_convertoutcome_free(ptr >>> 0, 1));
/**
 * Owns either the encoded GDOC or a stable error. Free after extraction.
 */
export class ConvertOutcome {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ConvertOutcome.prototype);
        obj.__wbg_ptr = ptr;
        ConvertOutcomeFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ConvertOutcomeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_convertoutcome_free(ptr, 0);
    }
    /**
     * Empty on success.
     * @returns {string}
     */
    get errorCode() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.convertoutcome_errorCode(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Transfers the encoded file once; undefined means conversion failed.
     * @returns {Uint8Array | undefined}
     */
    takeBytes() {
        const ret = wasm.convertoutcome_takeBytes(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Human-readable detail, including the failing page for unsupported PDF drawing features.
     * @returns {string}
     */
    get errorMessage() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.convertoutcome_errorMessage(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}

const DecodeOutcomeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_decodeoutcome_free(ptr >>> 0, 1));
/**
 * Owns either validated data or a typed error. Free after taking the document.
 */
export class DecodeOutcome {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(DecodeOutcome.prototype);
        obj.__wbg_ptr = ptr;
        DecodeOutcomeFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DecodeOutcomeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_decodeoutcome_free(ptr, 0);
    }
    /**
     * Stable error category; empty on success.
     * @returns {string}
     */
    get errorCode() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.decodeoutcome_errorCode(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Human-readable details; empty on success.
     * @returns {string}
     */
    get errorMessage() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.decodeoutcome_errorMessage(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Transfers document ownership once. Returns undefined on failure/subsequent calls.
     * @returns {DecodedDocument | undefined}
     */
    takeDocument() {
        const ret = wasm.decodeoutcome_takeDocument(this.__wbg_ptr);
        return ret === 0 ? undefined : DecodedDocument.__wrap(ret);
    }
}

const DecodedDocumentFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_decodeddocument_free(ptr >>> 0, 1));
/**
 * CPU buffers; each `take` transfers a buffer out once. Free after extraction.
 */
export class DecodedDocument {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(DecodedDocument.prototype);
        obj.__wbg_ptr = ptr;
        DecodedDocumentFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DecodedDocumentFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_decodeddocument_free(ptr, 0);
    }
    /**
     * Curve texture width and height, followed by prerender texture width and height.
     * @returns {Uint32Array}
     */
    dimensions() {
        const ret = wasm.decodeddocument_dimensions(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Exact curve metadata texels.
     * @returns {Uint8Array}
     */
    takeAtlas() {
        const ret = wasm.decodeddocument_takeAtlas(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Analytic clipping nodes; an empty buffer means only rectangular clipping.
     * @returns {Uint8Array}
     */
    takeClips() {
        const ret = wasm.decodeddocument_takeClips(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Flat width/height/first-instance/instance-count tuples, using doubles for exact page dimensions.
     * @returns {Float64Array}
     */
    takePages() {
        const ret = wasm.decodeddocument_takePages(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Per-draw compositing modes, with normal blending represented by zero.
     * @returns {Uint8Array}
     */
    takeBlends() {
        const ret = wasm.decodeddocument_takeBlends(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Four vec2f points per monotone cubic.
     * @returns {Uint8Array}
     */
    takeCurves() {
        const ret = wasm.decodeddocument_takeCurves(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Nested isolated transparency groups, 24 bytes per record.
     * @returns {Uint8Array}
     */
    takeGroups() {
        const ret = wasm.decodeddocument_takeGroups(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Six 12-byte vertices per glyph, little-endian.
     * @returns {Uint8Array}
     */
    takeVertices() {
        const ret = wasm.decodeddocument_takeVertices(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Ordered 80-byte affine/color/clip/range records.
     * @returns {Uint8Array}
     */
    takeInstances() {
        const ret = wasm.decodeddocument_takeInstances(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Curve row/column lookup table, addressed by DRAW/CLIP records.
     * @returns {Uint8Array}
     */
    takeCurveBins() {
        const ret = wasm.decodeddocument_takeCurveBins(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * 24-byte image metadata records, empty for profiles 1 and 2.
     * @returns {Uint8Array}
     */
    takeImageTable() {
        const ret = wasm.decodeddocument_takeImageTable(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Normalized outline-center x coordinates.
     * @returns {Float32Array}
     */
    takePositionsX() {
        const ret = wasm.decodeddocument_takePositionsX(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Normalized outline-center y coordinates, increasing down the page.
     * @returns {Float32Array}
     */
    takePositionsY() {
        const ret = wasm.decodeddocument_takePositionsY(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Premultiplied RGBA8 pixels, owned by the caller after extraction.
     * @returns {Uint8Array}
     */
    takeImagePixels() {
        const ret = wasm.decodeddocument_takeImagePixels(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Vertices for prerendering the small-text coverage atlas.
     * @returns {Uint8Array}
     */
    takeAtlasVertices() {
        const ret = wasm.decodeddocument_takeAtlasVertices(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Soft-mask transfer lookup tables, indexed by group record.
     * @returns {Uint8Array}
     */
    takeMaskTransfers() {
        const ret = wasm.decodeddocument_takeMaskTransfers(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Analytic radial shading metadata, indexed by image resource.
     * @returns {Uint8Array}
     */
    takeRadialGradients() {
        const ret = wasm.decodeddocument_takeRadialGradients(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Rendering profile: 1 atlas glyphs, 2 cubic contours, 3 contours with raster images.
     * @returns {number}
     */
    get profile() {
        const ret = wasm.decodeddocument_profile(this.__wbg_ptr);
        return ret >>> 0;
    }
}

const RasterOutcomeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_rasteroutcome_free(ptr >>> 0, 1));
/**
 * Owns a decoded image or a typed failure; free after taking the pixels.
 */
export class RasterOutcome {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(RasterOutcome.prototype);
        obj.__wbg_ptr = ptr;
        RasterOutcomeFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RasterOutcomeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_rasteroutcome_free(ptr, 0);
    }
    /**
     * Stable error category; empty on success.
     * @returns {string}
     */
    get errorCode() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.rasteroutcome_errorCode(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Transfers opaque RGBA8 once; undefined indicates failure or a previous transfer.
     * @returns {Uint8Array | undefined}
     */
    takePixels() {
        const ret = wasm.rasteroutcome_takePixels(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Human-readable details; empty on success.
     * @returns {string}
     */
    get errorMessage() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.rasteroutcome_errorMessage(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
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
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_export_0;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
        ;
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
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
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
        module_or_path = new URL('gpu_document_bg.wasm', import.meta.url);
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
