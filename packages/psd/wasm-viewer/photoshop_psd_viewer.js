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

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
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

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
/**
 * Writes an 8-bit RGB document of `document.layers` and the straight RGBA `composite`; PSB above 30000
 * pixels on a side.
 * @param {any} document
 * @param {Uint8Array} composite
 * @returns {Uint8Array}
 */
export function writePsd(document, composite) {
    const ptr0 = passArray8ToWasm0(composite, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.writePsd(document, ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

const PsdDocumentHandleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_psddocumenthandle_free(ptr >>> 0, 1));
/**
 * An open document: its parsed container and each layer record's saved visibility.
 */
export class PsdDocumentHandle {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PsdDocumentHandle.prototype);
        obj.__wbg_ptr = ptr;
        PsdDocumentHandleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PsdDocumentHandleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_psddocumenthandle_free(ptr, 0);
    }
    /**
     * Parses a PSD or PSB file. Fails only when the header or an outer section is unusable; damaged inner
     * structures stay readable as far as they parse.
     * @param {Uint8Array} bytes
     * @returns {PsdDocumentHandle}
     */
    static open(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.psddocumenthandle_open(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PsdDocumentHandle.__wrap(ret[0]);
    }
    /**
     * Size, depth, color mode, channels, format, image resources, document-level tagged blocks and the merged
     * image's layout.
     * @returns {any}
     */
    info() {
        const ret = wasm.psddocumenthandle_info(this.__wbg_ptr);
        return ret;
    }
    /**
     * The layer tree, bottom to top as stored: groups hold their children, also bottom to top. Each node carries
     * the summary a layers panel shows and `notes` on what the compositor leaves out or approximates. Fails when
     * group markers do not nest.
     * @returns {any}
     */
    layers() {
        const ret = wasm.psddocumenthandle_layers(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Everything known about layer record `index`: properties, mask, vector mask, effects with their settings,
     * adjustment settings, text, smart-object placement and contents, and the raw tagged blocks.
     * @param {number} index
     * @returns {any}
     */
    layerDetail(index) {
        const ret = wasm.psddocumenthandle_layerDetail(this.__wbg_ptr, index);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * The layer's own color and transparency as straight 8-bit RGBA (`left`, `top`, `width`, `height`, `pixels`),
     * converted from the document's depth with the crate's verified conversions, without masks or effects, and its
     * mask channels (`masks`: user mask `-2` and real raster mask `-3`) as 8-bit planes with their rectangles.
     * @param {number} index
     * @returns {any}
     */
    layerPixels(index) {
        const ret = wasm.psddocumenthandle_layerPixels(this.__wbg_ptr, index);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Composites the document with `options` (see [`RenderSettings::read`]): 8-bit RGB and Grayscale with
     * `composite_with_report`, 16- and 32-bit with `composite_deep`, CMYK and Lab of 8 and 16 bits in their own
     * channels with `composite_channels` whether or not `approximate` is set (shown through the approximate
     * conversion to sRGB, which the render's `approximations` report), Bitmap from its flattened image. With
     * `approximate`, what those refuse renders through `composite_with_report` instead: RGB and Grayscale documents
     * leniently, 16- and 32-bit ones at 8 bits, the other color modes and the CMYK and Lab documents
     * `composite_channels` rejects with their layers converted to sRGB, each approximation listed in the render's
     * `approximations`. With `typeLayers`, type layers are re-rendered from their text with the fonts of `fonts`
     * (`CompositeOptions::type_layers`): a type layer the crate does not re-render exactly, or whose font `fonts` lacks,
     * fails the render, or with `approximate` composites its cached raster and is listed. Without `typeLayers`,
     * `fonts` is not read. Visibility overrides apply to this render only. Throws `PsdUnsupportedError` naming the
     * first setting the compositor does not reproduce.
     * @param {any} options
     * @param {PsdFontLibrary} fonts
     * @returns {RenderedImage}
     */
    render(options, fonts) {
        _assertClass(fonts, PsdFontLibrary);
        const ret = wasm.psddocumenthandle_render(this.__wbg_ptr, options, fonts.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return RenderedImage.__wrap(ret[0]);
    }
    /**
     * The fonts the document's type layers use, by the PostScript names their style runs select from the layer's
     * `FontSet` (unused `FontSet` defaults such as `AdobeInvisFont` are left out), sorted by name, each with whether
     * `fonts` holds it and the record indices of the type layers using it (`fonts`), and per type layer record, bottom
     * to top, its name, visibility as saved and fonts, or `error` when its text cannot be read (`layers`).
     * @param {PsdFontLibrary} fonts
     * @returns {any}
     */
    documentFonts(fonts) {
        _assertClass(fonts, PsdFontLibrary);
        const ret = wasm.psddocumenthandle_documentFonts(this.__wbg_ptr, fonts.__wbg_ptr);
        return ret;
    }
    /**
     * Whether type layer record `index` re-renders from its text with `fonts` as the compositor would with
     * `typeLayers` (`supported`, else the crate's `reason`), with the fonts it uses (`fonts`) and those `fonts` lacks
     * (`missing`); `null` for other records. 8-bit documents are checked with `render_rgba8`, 16- and 32-bit RGB and
     * Grayscale ones with `render_saved`; the compositor can still refuse the layer's blending at those depths. The
     * layer is re-rendered once to decide, which takes as long as compositing it.
     * @param {number} index
     * @param {PsdFontLibrary} fonts
     * @returns {any}
     */
    textSupport(index, fonts) {
        _assertClass(fonts, PsdFontLibrary);
        const ret = wasm.psddocumenthandle_textSupport(this.__wbg_ptr, index, fonts.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Photoshop's saved merged image ("Maximize Compatibility") as straight 8-bit RGBA, unmatted from white where it
     * carries transparency and converted from 16 and 32 bits like the composite. Throws `PsdUnsupportedError` when
     * the file has none or its color mode is not rendered.
     * @returns {any}
     */
    merged() {
        const ret = wasm.psddocumenthandle_merged(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Compares `image`, a render of this document, with Photoshop's merged image as Photoshop stores it: our color
     * matted against white where the merged image has an alpha plane, 8-bit documents in levels, 16-bit ones in wire
     * levels and 32-bit ones in float32 units in the last place. CMYK and Lab composites made in their channels
     * compare channel by channel at the document's depth (`CMYK level`, `16-bit Lab level`, …), approximate renders of
     * other color modes in sRGB levels against the merged image converted the same way, and approximate renders of
     * 16- and 32-bit documents made at 8 bits in `8-bit level`s against the merged image reduced the same way.
     * Returns the counts, the largest difference, a histogram of absolute differences and a heat map (`pixels`):
     * matching pixels as a dimmed gray of our render, differing ones from yellow (one level) through red to magenta
     * (largest) on a logarithmic scale.
     * @param {RenderedImage} image
     * @returns {any}
     */
    difference(image) {
        _assertClass(image, RenderedImage);
        const ret = wasm.psddocumenthandle_difference(this.__wbg_ptr, image.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}

const PsdFontLibraryFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_psdfontlibrary_free(ptr >>> 0, 1));
/**
 * Fonts the caller supplies for re-rendering type layers, by PostScript name; nothing is loaded from the system. One
 * library serves any number of documents: [`DocumentHandle::render`], [`DocumentHandle::document_fonts`] and
 * [`DocumentHandle::text_support`] take it by reference. Fonts share their bytes, so a render copies none.
 */
export class PsdFontLibrary {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PsdFontLibraryFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_psdfontlibrary_free(ptr, 0);
    }
    /**
     * An empty library.
     */
    constructor() {
        const ret = wasm.psdfontlibrary_new();
        this.__wbg_ptr = ret >>> 0;
        PsdFontLibraryFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Adds a TrueType (`glyf`) or OpenType CFF font file under its PostScript name (`name` ID 6), replacing a font of
     * the same name, and returns its entry as [`Self::fonts`] lists it. Throws `PsdUnsupportedError` for font
     * collections (`.ttc`, `.otc`), WOFF files and fonts without a PostScript name or with outlines the crate does not
     * read, and `PsdError` for bytes that are not a readable font.
     * @param {Uint8Array} bytes
     * @returns {any}
     */
    add(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.psdfontlibrary_add(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * The fonts added, sorted by PostScript name: `name`, `format` (`TrueType` or `CFF`) and `size` in bytes.
     * @returns {Array<any>}
     */
    fonts() {
        const ret = wasm.psdfontlibrary_fonts(this.__wbg_ptr);
        return ret;
    }
    /**
     * Supplies Photoshop 26.0.0's `hyph_en_US.dic`, which hyphenated paragraph text needs; the crate verifies its
     * SHA-256 and throws `PsdUnsupportedError` for other dictionaries.
     * @param {Uint8Array} bytes
     */
    setHyphenationDictionary(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.psdfontlibrary_setHyphenationDictionary(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}

const RenderedImageFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_renderedimage_free(ptr >>> 0, 1));
/**
 * One composite: straight 8-bit RGBA for display and, for 16- and 32-bit documents, the composite at their depth, or
 * for CMYK and Lab documents the composite in their own channels.
 */
export class RenderedImage {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(RenderedImage.prototype);
        obj.__wbg_ptr = ptr;
        RenderedImageFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RenderedImageFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_renderedimage_free(ptr, 0);
    }
    /**
     * Width in pixels.
     * @returns {number}
     */
    get width() {
        const ret = wasm.renderedimage_width(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Height in pixels.
     * @returns {number}
     */
    get height() {
        const ret = wasm.renderedimage_height(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The depth the composite was computed at: 8, 16 or 32.
     * @returns {number}
     */
    get depth() {
        const ret = wasm.renderedimage_depth(this.__wbg_ptr);
        return ret;
    }
    /**
     * The composite as straight 8-bit RGBA, row by row: a fresh copy each call. 16-bit samples convert with
     * `R(q·255, 32768)`, 32-bit color with Photoshop's Exposure and Gamma toning at its defaults and alpha with
     * `⌊255a + ½⌋`; CMYK and Lab composites convert to sRGB through the approximate color management the
     * approximations name.
     * @returns {Uint8Array}
     */
    rgba8() {
        const ret = wasm.renderedimage_rgba8(this.__wbg_ptr);
        return ret;
    }
    /**
     * The documented approximations the render made, in words: the display conversion of a CMYK or Lab composite
     * made exactly in its channels, or what `approximate` allowed; empty when the render followed the exact path to
     * its display.
     * @returns {Array<any>}
     */
    approximations() {
        const ret = wasm.renderedimage_approximations(this.__wbg_ptr);
        return ret;
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
    imports.wbg.__wbg_length_a446193dc22c12f8 = function(arg0) {
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
    imports.wbg.__wbg_newwithbyteoffsetandlength_d97e637ebe145a9a = function(arg0, arg1, arg2) {
        const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
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
    imports.wbg.__wbindgen_is_falsy = function(arg0) {
        const ret = !arg0;
        return ret;
    };
    imports.wbg.__wbindgen_is_null = function(arg0) {
        const ret = arg0 === null;
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
        module_or_path = new URL('photoshop_psd_viewer_bg.wasm', import.meta.url);
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
