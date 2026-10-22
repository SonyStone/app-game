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
     * Bilinear retains at least half of each source axis; cubic scaling requires unavailable table state.
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
     * Resizes a root artboard or translates one admitted raster subtree on a fixed canvas.
     * RGB8 PSD only, canvas at most 2000x1000, coordinates within +/-2000, with auto-expand/shrinkwrap off.
     * Rebuilds merged RGB/alpha strictly and omits stale previews before publishing the revision.
     * Move translates an admitted raster subtree; create, live-parameter edits and frame replacement refuse.
     * Failure preserves bytes and revision. linearBlending is the host gamma-1 preference, false by default.
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
     * Admits unchanged size/font at size/unitsPerEm = 1/16, printable ASCII/CR, left Crisp point
     * or Single-line boxes, zero tracking/baseline and exact source raster regeneration.
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
     * Null leaves remain absent. This reads neither linked assets nor application-only state.
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
     * Atomically changes bounded nonvisual metadata, including print captions and authored slice text.
     * Preserves pixels and unrelated carriers; guide edits regenerate both 1092 and 1032.
     * Active credentials, unknown versions, duplicate identities/carriers and other note encodings refuse.
     * printCaption coordinates existing 1083/1011 slots. sliceName admits existing authored v6/v7/v8
     * Unicode names; sliceUrl also coordinates its existing 1054/slic URL association without fetching it.
     * Names are at most 4096 UTF-16 units, URLs 65536; NUL, duplicate/missing carriers and automatic slices refuse.
     * Comp application/capture, slice partitions, general print/resolution and XMP throw named Dependency errors.
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
     * Changes existing version-2 Lab Photo Filter settings in the bounded CMYK8/16 two-layer product.
     * recordIndex comes from inspectSource. Requires the measured embedded coated profile,
     * opaque raw source, full strength, absent/default white mask and relative/BPC-on/dither-off context.
     * Rebuilds native merged data and depth carriers before publishing; removes stale previews.
     * Other profiles, identity shortcuts, version-3 colors, unknown dependencies and unsupported
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
     * Replaces text and optional uniform style in one atomic text-only transaction.
     * Register actual original/requested fonts and the whitespace-marker face with addTextFont first.
     * Supports bounded printable ASCII/CR in left horizontal Crisp point or left/center/right Single-line RGB8 boxes.
     * Center/right require integral font size and zero tracking; full justification and non-left point text refuse.
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
