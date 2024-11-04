let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}


const lTextDecoder = typeof TextDecoder === 'undefined' ? (0, module.require)('util').TextDecoder : TextDecoder;

let cachedTextDecoder = new lTextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

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

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

let WASM_VECTOR_LEN = 0;

const lTextEncoder = typeof TextEncoder === 'undefined' ? (0, module.require)('util').TextEncoder : TextEncoder;

let cachedTextEncoder = new lTextEncoder('utf-8');

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

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => {
    wasm.__wbindgen_export_3.get(state.dtor)(state.a, state.b)
});

function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {
        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            if (--state.cnt === 0) {
                wasm.__wbindgen_export_3.get(state.dtor)(a, state.b);
                CLOSURE_DTORS.unregister(state);
            } else {
                state.a = a;
            }
        }
    };
    real.original = state;
    CLOSURE_DTORS.register(real, state, state);
    return real;
}
function __wbg_adapter_22(arg0, arg1, arg2) {
    wasm.closure3_externref_shim(arg0, arg1, arg2);
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
    return instance.ptr;
}
/**
 * @param {string} name
 * @returns {Element}
 */
export function greet(name) {
    const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.greet(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

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

function notDefined(what) { return () => { throw new Error(`${what} is not defined`); }; }

const AppWebGLFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_appwebgl_free(ptr >>> 0, 1));

export class AppWebGL {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(AppWebGL.prototype);
        obj.__wbg_ptr = ptr;
        AppWebGLFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AppWebGLFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_appwebgl_free(ptr, 0);
    }
    /**
     * @param {HTMLCanvasElement} canvas
     * @returns {AppWebGL}
     */
    static new(canvas) {
        const ret = wasm.appwebgl_new(canvas);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return AppWebGL.__wrap(ret[0]);
    }
    render() {
        const ret = wasm.appwebgl_render(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} width
     * @param {number} height
     */
    resize(width, height) {
        wasm.appwebgl_resize(this.__wbg_ptr, width, height);
    }
    /**
     * @returns {HTMLCanvasElement}
     */
    canvas() {
        const ret = wasm.appwebgl_canvas(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {WebGL2RenderingContext}
     */
    context() {
        const ret = wasm.appwebgl_context(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {PointerEvent} event
     */
    on_pointer_down(event) {
        _assertClass(event, PointerEvent);
        var ptr0 = event.__destroy_into_raw();
        wasm.appwebgl_on_pointer_down(this.__wbg_ptr, ptr0);
    }
}

const PointerEventFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pointerevent_free(ptr >>> 0, 1));

export class PointerEvent {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PointerEvent.prototype);
        obj.__wbg_ptr = ptr;
        PointerEventFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PointerEventFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pointerevent_free(ptr, 0);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @returns {PointerEvent}
     */
    static new(x, y) {
        const ret = wasm.pointerevent_new(x, y);
        return PointerEvent.__wrap(ret);
    }
    /**
     * @returns {number}
     */
    x() {
        const ret = wasm.pointerevent_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    y() {
        const ret = wasm.pointerevent_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} x
     */
    set_x(x) {
        wasm.pointerevent_set_x(this.__wbg_ptr, x);
    }
    /**
     * @param {number} y
     */
    set_y(y) {
        wasm.pointerevent_set_y(this.__wbg_ptr, y);
    }
}

export function __wbindgen_cb_drop(arg0) {
    const obj = arg0.original;
    if (obj.cnt-- == 1) {
        obj.a = 0;
        return true;
    }
    const ret = false;
    return ret;
};

export function __wbindgen_string_new(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
};

export function __wbindgen_boolean_get(arg0) {
    const v = arg0;
    const ret = typeof(v) === 'boolean' ? (v ? 1 : 0) : 2;
    return ret;
};

export function __wbg_instanceof_WebGl2RenderingContext_8dbe5170d8fdea28(arg0) {
    let result;
    try {
        result = arg0 instanceof WebGL2RenderingContext;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_bindVertexArray_9971ca458d8940ea(arg0, arg1) {
    arg0.bindVertexArray(arg1);
};

export function __wbg_bufferData_97b16c4aedab785a(arg0, arg1, arg2, arg3) {
    arg0.bufferData(arg1 >>> 0, arg2, arg3 >>> 0);
};

export function __wbg_createVertexArray_ec08b54b9f8c74ea(arg0) {
    const ret = arg0.createVertexArray();
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
};

export function __wbg_attachShader_299671ccaa78592c(arg0, arg1, arg2) {
    arg0.attachShader(arg1, arg2);
};

export function __wbg_bindBuffer_70e5a7ef4920142a(arg0, arg1, arg2) {
    arg0.bindBuffer(arg1 >>> 0, arg2);
};

export function __wbg_clear_678615798766f804(arg0, arg1) {
    arg0.clear(arg1 >>> 0);
};

export function __wbg_clearColor_0af942e0c8c453eb(arg0, arg1, arg2, arg3, arg4) {
    arg0.clearColor(arg1, arg2, arg3, arg4);
};

export function __wbg_compileShader_9680f4f1d833586c(arg0, arg1) {
    arg0.compileShader(arg1);
};

export function __wbg_createBuffer_478457cb9beff1a3(arg0) {
    const ret = arg0.createBuffer();
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
};

export function __wbg_createProgram_48b8a105fd0cfb35(arg0) {
    const ret = arg0.createProgram();
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
};

export function __wbg_createShader_f956a5ec67a77964(arg0, arg1) {
    const ret = arg0.createShader(arg1 >>> 0);
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
};

export function __wbg_drawElements_a40e0aeb70716911(arg0, arg1, arg2, arg3, arg4) {
    arg0.drawElements(arg1 >>> 0, arg2, arg3 >>> 0, arg4);
};

export function __wbg_enableVertexAttribArray_08b992ae13fe30a9(arg0, arg1) {
    arg0.enableVertexAttribArray(arg1 >>> 0);
};

export function __wbg_getProgramInfoLog_16c69289b6a9c98e(arg0, arg1, arg2) {
    const ret = arg1.getProgramInfoLog(arg2);
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_getProgramParameter_4c981ddc3b62dda8(arg0, arg1, arg2) {
    const ret = arg0.getProgramParameter(arg1, arg2 >>> 0);
    return ret;
};

export function __wbg_getShaderInfoLog_afb2baaac4baaff5(arg0, arg1, arg2) {
    const ret = arg1.getShaderInfoLog(arg2);
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_getShaderParameter_e21fb00f8255b86b(arg0, arg1, arg2) {
    const ret = arg0.getShaderParameter(arg1, arg2 >>> 0);
    return ret;
};

export function __wbg_linkProgram_983c5972b815b0de(arg0, arg1) {
    arg0.linkProgram(arg1);
};

export function __wbg_shaderSource_c36f18b5114855e7(arg0, arg1, arg2, arg3) {
    arg0.shaderSource(arg1, getStringFromWasm0(arg2, arg3));
};

export function __wbg_useProgram_8232847dbf97643a(arg0, arg1) {
    arg0.useProgram(arg1);
};

export function __wbg_vertexAttribPointer_f602d22ecb0758f6(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    arg0.vertexAttribPointer(arg1 >>> 0, arg2, arg3 >>> 0, arg4 !== 0, arg5, arg6);
};

export function __wbg_viewport_e333f63662d91f3a(arg0, arg1, arg2, arg3, arg4) {
    arg0.viewport(arg1, arg2, arg3, arg4);
};

export function __wbg_instanceof_Window_6575cd7f1322f82f(arg0) {
    let result;
    try {
        result = arg0 instanceof Window;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_document_d7fa2c739c2b191a(arg0) {
    const ret = arg0.document;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
};

export function __wbg_createElement_e4523490bd0ae51d() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.createElement(getStringFromWasm0(arg1, arg2));
    return ret;
}, arguments) };

export function __wbg_blur_d7e0bcc31c40e996() { return handleError(function (arg0) {
    arg0.blur();
}, arguments) };

export function __wbg_focus_6b6181f7644f6dbc() { return handleError(function (arg0) {
    arg0.focus();
}, arguments) };

export const __wbg_error_e297661c1014a1cc = typeof console.error == 'function' ? console.error : notDefined('console.error');

export const __wbg_log_f740dc2253ea759b = typeof console.log == 'function' ? console.log : notDefined('console.log');

export function __wbg_type_739ef24b64f58229(arg0, arg1) {
    const ret = arg1.type;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_width_cd62a064492c4489(arg0) {
    const ret = arg0.width;
    return ret;
};

export function __wbg_setwidth_23bf2deedd907275(arg0, arg1) {
    arg0.width = arg1 >>> 0;
};

export function __wbg_height_f9f3ea69baf38ed4(arg0) {
    const ret = arg0.height;
    return ret;
};

export function __wbg_setheight_239dc283bbe50da4(arg0, arg1) {
    arg0.height = arg1 >>> 0;
};

export function __wbg_getContext_bf8985355a4d22ca() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_settextContent_f9c4b60e6c009ea2(arg0, arg1, arg2) {
    arg0.textContent = arg1 === 0 ? undefined : getStringFromWasm0(arg1, arg2);
};

export function __wbg_addEventListener_4357f9b7b3826784() { return handleError(function (arg0, arg1, arg2, arg3) {
    arg0.addEventListener(getStringFromWasm0(arg1, arg2), arg3);
}, arguments) };

export function __wbg_removeEventListener_4c13d11156153514() { return handleError(function (arg0, arg1, arg2, arg3) {
    arg0.removeEventListener(getStringFromWasm0(arg1, arg2), arg3);
}, arguments) };

export function __wbg_key_001eb20ba3b3d2fd(arg0, arg1) {
    const ret = arg1.key;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_newnoargs_1ede4bf2ebbaaf43(arg0, arg1) {
    const ret = new Function(getStringFromWasm0(arg0, arg1));
    return ret;
};

export function __wbg_call_a9ef466721e824f2() { return handleError(function (arg0, arg1) {
    const ret = arg0.call(arg1);
    return ret;
}, arguments) };

export function __wbg_self_bf91bf94d9e04084() { return handleError(function () {
    const ret = self.self;
    return ret;
}, arguments) };

export function __wbg_window_52dd9f07d03fd5f8() { return handleError(function () {
    const ret = window.window;
    return ret;
}, arguments) };

export function __wbg_globalThis_05c129bf37fcf1be() { return handleError(function () {
    const ret = globalThis.globalThis;
    return ret;
}, arguments) };

export function __wbg_global_3eca19bb09e9c484() { return handleError(function () {
    const ret = global.global;
    return ret;
}, arguments) };

export function __wbindgen_is_undefined(arg0) {
    const ret = arg0 === undefined;
    return ret;
};

export function __wbg_buffer_ccaed51a635d8a2d(arg0) {
    const ret = arg0.buffer;
    return ret;
};

export function __wbg_newwithbyteoffsetandlength_e74b33a1f7565139(arg0, arg1, arg2) {
    const ret = new Uint16Array(arg0, arg1 >>> 0, arg2 >>> 0);
    return ret;
};

export function __wbg_newwithbyteoffsetandlength_fc445c2d308275d0(arg0, arg1, arg2) {
    const ret = new Float32Array(arg0, arg1 >>> 0, arg2 >>> 0);
    return ret;
};

export function __wbindgen_debug_string(arg0, arg1) {
    const ret = debugString(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbindgen_throw(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
};

export function __wbindgen_memory() {
    const ret = wasm.memory;
    return ret;
};

export function __wbindgen_closure_wrapper62(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 4, __wbg_adapter_22);
    return ret;
};

export function __wbindgen_closure_wrapper63(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 4, __wbg_adapter_22);
    return ret;
};

export function __wbindgen_init_externref_table() {
    const table = wasm.__wbindgen_export_2;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
    ;
};

