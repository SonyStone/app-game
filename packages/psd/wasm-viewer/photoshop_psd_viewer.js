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

/**
 * Reads persisted source styles, locks, labels, metadata envelopes and XMP without renderer projection.
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

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
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
     * Compares a render to the saved snapshot. A mismatch can reflect authoring-state differences; this is not
     * a Photoshop 26 next-open oracle. Equality applies only to these pixels and does not authorize an edit.
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
    /**
     * Everything known about layer record `index`: properties, mask, vector mask, effects with their settings,
     * adjustment settings, text, smart-object placement and contents, and the raw tagged blocks. The properties'
     * opacity, Fill and `transparencyShapesLayer` are those Photoshop 26 imports, with `legacyOpacity` as in
     * [`Self::layers`].
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
     * Composite exact process channels and convert them separately to configured sRGB.
     * `options` has render's blend/text gamma, fonts, state and visibility contract, with approximate=false.
     * `color` requires caller-owned `srgb: Uint8Array`; optional `workingRgb`, `workingGray`, `workingCmyk`
     * supply untagged sources. The caller attests srgb bytes describe sRGB; unknown RGB serializations are approximate.
     * No installed profiles are read. Defaults: engine="ace", intent="relative", blackPointCompensation=true,
     * dither=false, preciseFloat=true, importPolicy="preserve", pixelAspectCorrection=false. Unknown color keys fail.
     * importPolicy records an already applied import, never changes process samples or repeats conversion.
     * OCIO document kinds and color.ocio=true dispatch before ICC and refuse without an external processor.
     * proof, sceneReferred and hdrPreview default false and refuse when true. This API defines sRGB output,
     * not live monitor presentation. Returns process and srgb typed samples, rgba8, conversion provenance,
     * DisplayConversion approximations and continuous displayWidth/displayHeight. Word samples use PSD wire16;
     * alpha is separate from color in each interleaved pixel. Float display and dither remain reported approximations.
     * Bitmap bits and Indexed indices/palette remain native in process; only the display operand expands.
     * Ink modes and auxiliary plates remain available unchanged through savedProcessChannels.
     * @param {any} options
     * @param {any} color
     * @param {PsdFontLibrary} fonts
     * @returns {any}
     */
    renderColor(options, color, fonts) {
        _assertClass(fonts, PsdFontLibrary);
        const ret = wasm.psddocumenthandle_renderColor(this.__wbg_ptr, options, color, fonts.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Reports supplied release mismatches separately from unavailable raster fonts, including uniquely
     * supplied addActiveFace collection faces. Equal versions cannot
     * prove identical charstrings because PSD does not embed those font programs.
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
     * Renders a rectangle in document pixels as a `PsdRegionPixels` object. `left`, `top`,
     * `width`, `height` must describe a nonempty rectangle inside the canvas. `options` and
     * `fonts` have `render`'s meaning, with optional positive integer `maxWorkPixels`, default
     * 16,777,216. Spatial dependencies may require a full-canvas fallback, reported by
     * `strategy`; a dependency exceeding the limit throws `PsdUnsupportedError` before rendering.
     * Pixels equal the corresponding whole render, including its reported approximations.
     * The returned `Uint8Array` owns its storage and can be transferred to another worker.
     * `options.budget` overrides 64 MiB per allocation/512 MiB live admission per call, using
     * allocationBytes/liveBytes/retainedBytes. Retained bytes include external fonts/caches.
     * Conservative accounting can require a larger liveBytes value for a many-layer document.
     * @param {number} left
     * @param {number} top
     * @param {number} width
     * @param {number} height
     * @param {any} options
     * @param {PsdFontLibrary} fonts
     * @returns {PsdRegionPixels}
     */
    renderRegion(left, top, width, height, options, fonts) {
        _assertClass(fonts, PsdFontLibrary);
        const ret = wasm.psddocumenthandle_renderRegion(this.__wbg_ptr, left, top, width, height, options, fonts.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
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
     * Renders 1 to 256 rectangles from one state/visibility/font snapshot. Each rectangle is
     * `{ left, top, width, height }` in integer document pixels. Their total output area and
     * every spatial dependency must fit `maxWorkPixels`. Full-canvas fallbacks are computed
     * once for the batch and freed before return; each result has `renderRegion`'s contract.
     * A failure returns no partial batch and restores the document's visibility.
     * @param {PsdRegionRect[]} rectangles
     * @param {any} options
     * @param {PsdFontLibrary} fonts
     * @returns {PsdRegionPixels[]}
     */
    renderRegions(rectangles, options, fonts) {
        _assertClass(fonts, PsdFontLibrary);
        const ret = wasm.psddocumenthandle_renderRegions(this.__wbg_ptr, rectangles, options, fonts.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Decimates the file's saved merged image with bounded row scratch. Returns `PsdRegionPixels`
     * with `source: 'savedComposite'` and `exactToLayerRender: false`. This preview can be stale
     * and may differ from Photoshop-26 recompositing. It ignores visibility/state edits and must
     * be discarded after edits. Refuses an image marked as not real. `maxWorkPixels` limits
     * output pixels, default 16,777,216 when zero. `step` must be positive.
     * Optional third argument overrides 64 MiB allocation/512 MiB live budgets per call with
     * allocationBytes/liveBytes/retainedBytes; container storage is counted automatically.
     * @param {number} step
     * @param {number} max_work_pixels
     * @param {object | null} [budget_options]
     * @returns {PsdRegionPixels}
     */
    savedOverview(step, max_work_pixels, budget_options) {
        const ret = wasm.psddocumenthandle_savedOverview(this.__wbg_ptr, step, max_work_pixels, isLikeNone(budget_options) ? 0 : addToExternrefTable0(budget_options));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Exact integer decimation of a fresh layer render. Output pixel `(x,y)` samples document
     * pixel `(x*step,y*step)`, without filtering or scaling operation parameters. Dimensions are
     * `ceil(documentWidth/step)` by `ceil(documentHeight/step)`. `step` must be positive.
     * Returns `PsdRegionPixels`; options, visibility, state and fonts match `renderRegion`.
     * Rendering sampled scanlines bounds canvas storage but may be slower than a whole render.
     * @param {number} step
     * @param {any} options
     * @param {PsdFontLibrary} fonts
     * @returns {PsdRegionPixels}
     */
    renderOverview(step, options, fonts) {
        _assertClass(fonts, PsdFontLibrary);
        const ret = wasm.psddocumenthandle_renderOverview(this.__wbg_ptr, step, options, fonts.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Parses with explicit host budgets before copying payloads. Defaults are 64 MiB per
     * allocation and 512 MiB live, depth 64, u64 offsets through i64::MAX. Options are
     * allocationBytes/liveBytes/maxOffset/maxDepth/retainedBytes. Retained bytes must include
     * external caches; the binding additionally accounts for its input and the host input copy.
     * Input length is checked before copying the host Uint8Array into WASM.
     * Use per-call overrides when a compressed payload exceeds the default; region output stays windowed.
     * @param {Uint8Array} bytes
     * @param {any} options
     * @returns {PsdDocumentHandle}
     */
    static openWithBudget(bytes, options) {
        const ret = wasm.psddocumenthandle_openWithBudget(bytes, options);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PsdDocumentHandle.__wrap(ret[0]);
    }
    /**
     * Full rendering with explicit per-call host admission. Defaults are 64 MiB per
     * allocation and 512 MiB live; retainedBytes includes caller fonts and caches.
     * This can conservatively refuse a dependency graph before legacy render() enters it.
     * @param {any} options
     * @param {PsdFontLibrary} fonts
     * @param {any} budget_options
     * @returns {RenderedImage}
     */
    renderWithBudget(options, fonts, budget_options) {
        _assertClass(fonts, PsdFontLibrary);
        const ret = wasm.psddocumenthandle_renderWithBudget(this.__wbg_ptr, options, fonts.__wbg_ptr, budget_options);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return RenderedImage.__wrap(ret[0]);
    }
    /**
     * Opens a PSD or PSB as Photoshop 26 does, keeping the strict reading of [`Self::open`] where it is Photoshop's
     * document or Photoshop refuses a file the strict reader reads (see the `opening` module). `answers` holds the
     * answers to Photoshop's prompts: `corruptLayers` (`ok`, `flatten` or `cancel`) and `layerDataProblem`
     * (`readComposite` or `cancel`), each absent until the prompt was shown. Returns one of
     *
     * - `{ outcome: 'opened', document, opening }`: `document` is a handle like [`Self::open`]'s; `opening` says
     *   whether the document is Photoshop's interpretation (`reader`: `strict` or `photoshop`), the prompts and alerts
     *   Photoshop shows with their answers (`alerts`: `kind`, `message`, `answer` as the button's label), what the
     *   interpretation changed from the strict reading (`repairs`, in words), why the strict reader failed
     *   (`strictError`) and Photoshop's refusal of a file the strict reader reads (`photoshopRefuses`);
     * - `{ outcome: 'refused', message }`: Photoshop does not open the file (and the strict reader cannot), or a prompt
     *   was answered Cancel; the message names Photoshop's behavior;
     * - `{ outcome: 'needsAnswer', prompt }`: Photoshop asks before opening and `answers` holds no answer:
     *   `prompt` has its `id` (the answers' key), its verbatim `message` and its `buttons` (`answer`, `label`,
     *   `default` for Photoshop's default button), in Photoshop's order.
     *
     * Throws a `TypeError` for answers that are not one of their prompt's.
     * @param {Uint8Array} bytes
     * @param {any} answers
     * @returns {any}
     */
    static openLikePhotoshop(bytes, answers) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.psddocumenthandle_openLikePhotoshop(ptr0, len0, answers);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Exact decoded saved process planes, including auxiliary alpha/spot planes as separate byte arrays.
     * Native byte order, packed Bitmap rows, Indexed palette, ink data and float bit patterns are preserved.
     * The source is the potentially stale saved merged image with its original matte, not a fresh layer render.
     * Resources preserve plate names, display metadata, profiles and untagged state without guessing.
     * Optional visibility supplies one boolean per saved plane; omitted view visibility is returned as null.
     * @param {Array<any> | null} [visibility]
     * @returns {any}
     */
    savedProcessChannels(visibility) {
        const ret = wasm.psddocumenthandle_savedProcessChannels(this.__wbg_ptr, isLikeNone(visibility) ? 0 : addToExternrefTable0(visibility));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Recovery opening with explicit per-call budgets and typed PsdBudgetError failures.
     * Defaults are 64 MiB per allocation, 512 MiB live and nesting depth 64. Caller retainedBytes
     * covers external storage; both reader models and both input copies are additionally counted.
     * @param {Uint8Array} bytes
     * @param {any} answers
     * @param {any} options
     * @returns {any}
     */
    static openLikePhotoshopWithBudget(bytes, answers, options) {
        const ret = wasm.psddocumenthandle_openLikePhotoshopWithBudget(bytes, answers, options);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
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
     * The layer tree, bottom to top as stored: groups hold their children, also bottom to top. Each node carries
     * the summary a layers panel shows and `notes` on what the compositor leaves out or approximates. Its `opacity`,
     * `fill` and `transparencyShapesLayer` are those Photoshop 26 imports, which its Layers panel shows and the
     * compositor uses; `legacyOpacity` is `{ storedOpacity, inferredVersion }` for a legacy record whose stored opacity
     * it imports as Fill ([`legacy_opacity`]), `null` otherwise. Fails when group markers do not nest.
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
     * Displays the saved snapshot without reconstructing layers or validating historical text state. It may
     * differ from `render()` and Photoshop 26 next-open composition. Decoding does not certify an editable state.
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
     * Reconstructs layers for the Photoshop 26 target with caller-supplied settings. Historical authoring state
     * is not reconstructed, and a successful render can differ from the saved snapshot even when Photoshop 26
     * wrote it. Use `merged()` for saved pixels. Empty approximations describe this render policy only.
     * Composites the document with `options` (see [`RenderSettings::read`]): 8-bit RGB and Grayscale with
     * `composite_with_report`, 16- and 32-bit with `composite_deep`, CMYK and Lab of 8 and 16 bits in their own
     * channels with `composite_channels` whether or not `approximate` is set (shown through the approximate
     * conversion to sRGB, which the render's `approximations` report), Bitmap from its flattened image. With
     * `approximate`, what those refuse renders through `composite_with_report` instead: RGB and Grayscale documents
     * leniently, 16- and 32-bit ones at their depth where only modeled adjustment kernels are refused and otherwise at
     * 8 bits, the other color modes and the CMYK and Lab documents
     * `composite_channels` rejects with their layers converted to sRGB, each approximation listed in the render's
     * `approximations`. With `typeLayers`, type layers are re-rendered from their text with the fonts of `fonts`
     * (`CompositeOptions::type_layers`): a type layer the crate does not re-render exactly, or whose font `fonts` lacks,
     * fails the render, or with `approximate` composites its cached raster and is listed. Separately,
     * `fonts` supplies active-face data for imported-layout diagnostics and bounded cached-mixer selection
     * even with `typeLayers: false`. Pass known active PostScript names as `availableFonts` for missing-font
     * decisions; omit an unknown inventory. This option is used only when active face bytes are supplied.
     * The host must add original active TrueType bytes with their actual TTC indices using `addActiveFace`, or
     * standalone active fonts using `add`. No system inventory is read. An empty library preserves existing
     * cached rendering and abstains from font-dependent witnesses. A partial library checks uniquely supplied
     * faces without treating absent names as missing fonts; it never certifies every imported layout as valid.
     * Conflicts throw in strict mode. In `approximate`, supported global-style cmap or coherent descender
     * conflicts select ordinary document mixing and retain the cached raster and CachedRaster diagnostic.
     * Other imports stay unresolved and keep their existing mixing and reporting.
     * Visibility overrides apply to this render only. Throws `PsdUnsupportedError` naming the
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
     * The document's saved alternate states, which `render`'s `state` selects: `comps`, its layer comps in panel
     * order (`id`, `name`, `comment` when it has one); `lastAppliedComp`, the ID of the comp last applied, which the
     * saved layers need not match, or `null`; `frames`, the frames of the active frame set in playback order (`id`,
     * `delay` in hundredths of a second); `activeFrame`, the ID of the saved active frame, whose selection leaves the
     * document as saved, or `null`. Lists are empty without comps or a frame animation; a resource that does not
     * parse counts as absent and is named in `errors`.
     * @returns {any}
     */
    states() {
        const ret = wasm.psddocumenthandle_states(this.__wbg_ptr);
        return ret;
    }
}

const PsdFontLibraryFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_psdfontlibrary_free(ptr >>> 0, 1));
/**
 * Host-supplied fonts for re-rendering, imported-layout diagnostics and bounded cached-mixer selection.
 * `addActiveFace` accepts active sfnt/TTC faces without adding raster fonts; `add` also adds standalone fonts
 * for rerasterization. Empty input preserves
 * existing cached rendering and abstains from font-dependent witnesses. Nothing is loaded from the system. One
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
     * Supplies an active TrueType face for imported-layout diagnostics and bounded cached-mixer selection.
     * Pass original `.ttf` or TrueType `.ttc`/`.otc` bytes, the actual zero-based `faceIndex`, and a host source
     * identifier `provenance`, such as a path or asset ID. The returned PostScript name comes from the face;
     * CSS family names cannot substitute for bytes. Preserve collection indices: Helvetica Neue regular 0,
     * bold 1, light 7, medium 10; STHeitiSC-Light is index 1 in its original collection.
     * Pass this library to render/renderRegion/renderOverview with `typeLayers: false`. For missing-font
     * decisions also pass a trustworthy `availableFonts` PostScript-name inventory; omit unknown inventories.
     * `availableFonts` is ignored without active bytes, preserving previous name-only viewer behavior.
     * Supported RGB8 schema-7 global-style cmap or coherent descender conflicts use ordinary document mixing,
     * retaining the cached raster and CachedRaster diagnostic. Strict rendering still refuses these conflicts.
     * Absence of a conflict stays unresolved. Without active bytes the previous rendering behavior is preserved.
     * This does not add raster fonts or install fonts. CFF, invalid indices and unreadable/unnamed faces throw.
     * Repeated identical bytes/index deduplicate; distinct faces under one name abstain. Partial face input
     * checks only uniquely resolved supplied faces and never implies absent faces are unavailable.
     * @param {Uint8Array} bytes
     * @param {number} face_index
     * @param {string} provenance
     * @returns {string}
     */
    addActiveFace(bytes, face_index, provenance) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(provenance, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.psdfontlibrary_addActiveFace(this.__wbg_ptr, ptr0, len0, face_index, ptr1, len1);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
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
    /**
     * Adds a TrueType (`glyf`) or OpenType CFF font file under its PostScript name (`name` ID 6), replacing a font of
     * the same name for rerasterization, and returns its entry as [`Self::fonts`] lists it. Throws `PsdUnsupportedError` for font
     * collections (`.ttc`, `.otc`), WOFF files and fonts without a PostScript name or with outlines the crate does not
     * read, and `PsdError` for bytes that are not a readable font. The host attests this is an active face.
     * TrueType bytes also feed imported-layout diagnostics and cached-mixer selection independently of
     * `typeLayers`; distinct bytes sharing
     * a name make validation ambiguous even though the rerasterization library replaces its earlier entry.
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
     * An empty library.
     */
    constructor() {
        const ret = wasm.psdfontlibrary_new();
        this.__wbg_ptr = ret >>> 0;
        PsdFontLibraryFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * The fonts added, sorted by PostScript name: `name`, `format` (`TrueType` or `CFF`) and `size` in bytes.
     * @returns {Array<any>}
     */
    fonts() {
        const ret = wasm.psdfontlibrary_fonts(this.__wbg_ptr);
        return ret;
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
     * The documented approximations the render made, in words: the display conversion of a CMYK or Lab composite
     * made exactly in its channels, or what `approximate` allowed; empty when the render followed the exact path to
     * its display.
     * @returns {Array<any>}
     */
    approximations() {
        const ret = wasm.renderedimage_approximations(this.__wbg_ptr);
        return ret;
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
    imports.wbg.__wbg_new_780abee5c1739fd7 = function(arg0) {
        const ret = new Float32Array(arg0);
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
    imports.wbg.__wbg_newwithbyteoffsetandlength_e6b7e69acd4c7354 = function(arg0, arg1, arg2) {
        const ret = new Float32Array(arg0, arg1 >>> 0, arg2 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_ownKeys_3930041068756f1f = function() { return handleError(function (arg0) {
        const ret = Reflect.ownKeys(arg0);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_psddocumenthandle_new = function(arg0) {
        const ret = PsdDocumentHandle.__wrap(arg0);
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
    imports.wbg.__wbg_subarray_aa9065fa9dc5df96 = function(arg0, arg1, arg2) {
        const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
        return ret;
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
    imports.wbg.__wbindgen_is_falsy = function(arg0) {
        const ret = !arg0;
        return ret;
    };
    imports.wbg.__wbindgen_is_null = function(arg0) {
        const ret = arg0 === null;
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
