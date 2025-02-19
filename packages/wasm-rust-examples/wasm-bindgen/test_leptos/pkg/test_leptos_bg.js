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

function _assertBoolean(n) {
    if (typeof(n) !== 'boolean') {
        throw new Error(`expected a boolean argument, found ${typeof(n)}`);
    }
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

    if (typeof(arg) !== 'string') throw new Error(`expected a string argument, found ${typeof(arg)}`);

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
        if (ret.read !== arg.length) throw new Error('failed to pass whole string');
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

function logError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        let error = (function () {
            try {
                return e instanceof Error ? `${e.message}\n\nStack:\n${e.stack}` : e.toString();
            } catch(_) {
                return "<failed to stringify thrown value>";
            }
        }());
        console.error("wasm-bindgen: imported JS function that was not marked as `catch` threw an error:", error);
        throw e;
    }
}

function _assertNum(n) {
    if (typeof(n) !== 'number') throw new Error(`expected a number argument, found ${typeof(n)}`);
}
function __wbg_adapter_26(arg0, arg1, arg2) {
    _assertNum(arg0);
    _assertNum(arg1);
    wasm.closure90_externref_shim(arg0, arg1, arg2);
}

function __wbg_adapter_29(arg0, arg1, arg2) {
    _assertNum(arg0);
    _assertNum(arg1);
    wasm.closure157_externref_shim(arg0, arg1, arg2);
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
function __wbg_adapter_110(arg0, arg1, arg2, arg3) {
    _assertNum(arg0);
    _assertNum(arg1);
    wasm.closure168_externref_shim(arg0, arg1, arg2, arg3);
}

const __wbindgen_enum_BinaryType = ["blob", "arraybuffer"];

const __wbindgen_enum_ReadableStreamReaderMode = ["byob"];

const __wbindgen_enum_ReadableStreamType = ["bytes"];

const __wbindgen_enum_ReferrerPolicy = ["", "no-referrer", "no-referrer-when-downgrade", "origin", "origin-when-cross-origin", "unsafe-url", "same-origin", "strict-origin", "strict-origin-when-cross-origin"];

const __wbindgen_enum_RequestCache = ["default", "no-store", "reload", "no-cache", "force-cache", "only-if-cached"];

const __wbindgen_enum_RequestCredentials = ["omit", "same-origin", "include"];

const __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];

const __wbindgen_enum_RequestRedirect = ["follow", "error", "manual"];

const __wbindgen_enum_ResponseType = ["basic", "cors", "default", "error", "opaque", "opaqueredirect"];

const __wbindgen_enum_ShadowRootMode = ["open", "closed"];

const IntoUnderlyingByteSourceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingbytesource_free(ptr >>> 0, 1));

export class IntoUnderlyingByteSource {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingByteSourceFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingbytesource_free(ptr, 0);
    }
    /**
     * @returns {any}
     */
    get type() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.intounderlyingbytesource_type(this.__wbg_ptr);
        return __wbindgen_enum_ReadableStreamType[ret];
    }
    /**
     * @returns {number}
     */
    get autoAllocateChunkSize() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.intounderlyingbytesource_autoAllocateChunkSize(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {ReadableByteStreamController} controller
     */
    start(controller) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.intounderlyingbytesource_start(this.__wbg_ptr, controller);
    }
    /**
     * @param {ReadableByteStreamController} controller
     * @returns {Promise<any>}
     */
    pull(controller) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.intounderlyingbytesource_pull(this.__wbg_ptr, controller);
        return ret;
    }
    cancel() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        const ptr = this.__destroy_into_raw();
        _assertNum(ptr);
        wasm.intounderlyingbytesource_cancel(ptr);
    }
}

const IntoUnderlyingSinkFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingsink_free(ptr >>> 0, 1));

export class IntoUnderlyingSink {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingSinkFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingsink_free(ptr, 0);
    }
    /**
     * @param {any} chunk
     * @returns {Promise<any>}
     */
    write(chunk) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.intounderlyingsink_write(this.__wbg_ptr, chunk);
        return ret;
    }
    /**
     * @returns {Promise<any>}
     */
    close() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        const ptr = this.__destroy_into_raw();
        _assertNum(ptr);
        const ret = wasm.intounderlyingsink_close(ptr);
        return ret;
    }
    /**
     * @param {any} reason
     * @returns {Promise<any>}
     */
    abort(reason) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        const ptr = this.__destroy_into_raw();
        _assertNum(ptr);
        const ret = wasm.intounderlyingsink_abort(ptr, reason);
        return ret;
    }
}

const IntoUnderlyingSourceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingsource_free(ptr >>> 0, 1));

export class IntoUnderlyingSource {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingSourceFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingsource_free(ptr, 0);
    }
    /**
     * @param {ReadableStreamDefaultController} controller
     * @returns {Promise<any>}
     */
    pull(controller) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.intounderlyingsource_pull(this.__wbg_ptr, controller);
        return ret;
    }
    cancel() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        const ptr = this.__destroy_into_raw();
        _assertNum(ptr);
        wasm.intounderlyingsource_cancel(ptr);
    }
}

const LeptosElementFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_leptoselement_free(ptr >>> 0, 1));

export class LeptosElement {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(LeptosElement.prototype);
        obj.__wbg_ptr = ptr;
        LeptosElementFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LeptosElementFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_leptoselement_free(ptr, 0);
    }
    /**
     * @returns {LeptosElement}
     */
    static new() {
        const ret = wasm.leptoselement_new();
        return LeptosElement.__wrap(ret);
    }
    /**
     * @returns {HTMLElement}
     */
    get element() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.leptoselement_element(this.__wbg_ptr);
        return ret;
    }
}

export function __wbindgen_string_new(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
};

export function __wbindgen_is_undefined(arg0) {
    const ret = arg0 === undefined;
    _assertBoolean(ret);
    return ret;
};

export function __wbindgen_cb_drop(arg0) {
    const obj = arg0.original;
    if (obj.cnt-- == 1) {
        obj.a = 0;
        return true;
    }
    const ret = false;
    _assertBoolean(ret);
    return ret;
};

export function __wbindgen_is_null(arg0) {
    const ret = arg0 === null;
    _assertBoolean(ret);
    return ret;
};

export function __wbindgen_is_falsy(arg0) {
    const ret = !arg0;
    _assertBoolean(ret);
    return ret;
};

export function __wbg_instanceof_Window_6575cd7f1322f82f() { return logError(function (arg0) {
    let result;
    try {
        result = arg0 instanceof Window;
    } catch (_) {
        result = false;
    }
    const ret = result;
    _assertBoolean(ret);
    return ret;
}, arguments) };

export function __wbg_document_d7fa2c739c2b191a() { return logError(function (arg0) {
    const ret = arg0.document;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_createElement_e4523490bd0ae51d() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.createElement(getStringFromWasm0(arg1, arg2));
    return ret;
}, arguments) };

export function __wbg_createElementNS_e51a368ab3a64b37() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
    const ret = arg0.createElementNS(arg1 === 0 ? undefined : getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
    return ret;
}, arguments) };

export function __wbg_createTextNode_3b33c97f8ef3e999() { return logError(function (arg0, arg1, arg2) {
    const ret = arg0.createTextNode(getStringFromWasm0(arg1, arg2));
    return ret;
}, arguments) };

export function __wbg_setAttribute_2a8f647a8d92c712() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
    arg0.setAttribute(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
}, arguments) };

export function __wbg_remove_d7a18d9f46bc50fd() { return logError(function (arg0) {
    arg0.remove();
}, arguments) };

export function __wbg_view_de0e81c5c00d2129() { return logError(function (arg0) {
    const ret = arg0.view;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_respond_ffb6928cd9b79c32() { return handleError(function (arg0, arg1) {
    arg0.respond(arg1 >>> 0);
}, arguments) };

export function __wbg_target_b0499015ea29563d() { return logError(function (arg0) {
    const ret = arg0.target;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_cancelBubble_1fc3632e2ba513ed() { return logError(function (arg0) {
    const ret = arg0.cancelBubble;
    _assertBoolean(ret);
    return ret;
}, arguments) };

export function __wbg_composedPath_d27a772830ab5dd0() { return logError(function (arg0) {
    const ret = arg0.composedPath();
    return ret;
}, arguments) };

export function __wbg_addEventListener_4357f9b7b3826784() { return handleError(function (arg0, arg1, arg2, arg3) {
    arg0.addEventListener(getStringFromWasm0(arg1, arg2), arg3);
}, arguments) };

export function __wbg_removeEventListener_4c13d11156153514() { return handleError(function (arg0, arg1, arg2, arg3) {
    arg0.removeEventListener(getStringFromWasm0(arg1, arg2), arg3);
}, arguments) };

export function __wbg_parentNode_7e7d8adc9b41ce58() { return logError(function (arg0) {
    const ret = arg0.parentNode;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_setnodeValue_ddb802810d61c610() { return logError(function (arg0, arg1, arg2) {
    arg0.nodeValue = arg1 === 0 ? undefined : getStringFromWasm0(arg1, arg2);
}, arguments) };

export function __wbg_insertBefore_5caa6ab4d3d6b481() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.insertBefore(arg1, arg2);
    return ret;
}, arguments) };

export const __wbg_log_f740dc2253ea759b = typeof console.log == 'function' ? console.log : notDefined('console.log');

export const __wbg_warn_41503a1c2194de89 = typeof console.warn == 'function' ? console.warn : notDefined('console.warn');

export const __wbg_warn_5762de9f616d34f8 = typeof console.warn == 'function' ? console.warn : notDefined('console.warn');

export function __wbg_instanceof_HtmlElement_aab18e065dc9207d() { return logError(function (arg0) {
    let result;
    try {
        result = arg0 instanceof HTMLElement;
    } catch (_) {
        result = false;
    }
    const ret = result;
    _assertBoolean(ret);
    return ret;
}, arguments) };

export function __wbg_close_cfd08d9cf9f36856() { return handleError(function (arg0) {
    arg0.close();
}, arguments) };

export function __wbg_enqueue_e693a6fb4f3261c1() { return handleError(function (arg0, arg1) {
    arg0.enqueue(arg1);
}, arguments) };

export function __wbg_instanceof_ShadowRoot_6d00cedbc919c9a6() { return logError(function (arg0) {
    let result;
    try {
        result = arg0 instanceof ShadowRoot;
    } catch (_) {
        result = false;
    }
    const ret = result;
    _assertBoolean(ret);
    return ret;
}, arguments) };

export function __wbg_host_4a0b95cc36a45cb6() { return logError(function (arg0) {
    const ret = arg0.host;
    return ret;
}, arguments) };

export function __wbg_byobRequest_86ac467c94924d3c() { return logError(function (arg0) {
    const ret = arg0.byobRequest;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_close_7cda9dd901230214() { return handleError(function (arg0) {
    arg0.close();
}, arguments) };

export function __wbindgen_is_function(arg0) {
    const ret = typeof(arg0) === 'function';
    _assertBoolean(ret);
    return ret;
};

export const __wbg_queueMicrotask_c5419c06eab41e73 = typeof queueMicrotask == 'function' ? queueMicrotask : notDefined('queueMicrotask');

export function __wbg_queueMicrotask_848aa4969108a57e() { return logError(function (arg0) {
    const ret = arg0.queueMicrotask;
    return ret;
}, arguments) };

export function __wbg_get_5419cf6b954aa11d() { return logError(function (arg0, arg1) {
    const ret = arg0[arg1 >>> 0];
    return ret;
}, arguments) };

export function __wbg_new_70a2f23d1565c04c() { return logError(function (arg0, arg1) {
    const ret = new Error(getStringFromWasm0(arg0, arg1));
    return ret;
}, arguments) };

export function __wbg_newnoargs_1ede4bf2ebbaaf43() { return logError(function (arg0, arg1) {
    const ret = new Function(getStringFromWasm0(arg0, arg1));
    return ret;
}, arguments) };

export function __wbg_call_a9ef466721e824f2() { return handleError(function (arg0, arg1) {
    const ret = arg0.call(arg1);
    return ret;
}, arguments) };

export function __wbg_call_3bfa248576352471() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.call(arg1, arg2);
    return ret;
}, arguments) };

export function __wbg_new_1073970097e5a420() { return logError(function (arg0, arg1) {
    try {
        var state0 = {a: arg0, b: arg1};
        var cb0 = (arg0, arg1) => {
            const a = state0.a;
            state0.a = 0;
            try {
                return __wbg_adapter_110(a, state0.b, arg0, arg1);
            } finally {
                state0.a = a;
            }
        };
        const ret = new Promise(cb0);
        return ret;
    } finally {
        state0.a = state0.b = 0;
    }
}, arguments) };

export function __wbg_resolve_0aad7c1484731c99() { return logError(function (arg0) {
    const ret = Promise.resolve(arg0);
    return ret;
}, arguments) };

export function __wbg_then_748f75edfb032440() { return logError(function (arg0, arg1) {
    const ret = arg0.then(arg1);
    return ret;
}, arguments) };

export function __wbg_globalThis_05c129bf37fcf1be() { return handleError(function () {
    const ret = globalThis.globalThis;
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

export function __wbg_global_3eca19bb09e9c484() { return handleError(function () {
    const ret = global.global;
    return ret;
}, arguments) };

export function __wbg_newwithbyteoffsetandlength_7e3eb787208af730() { return logError(function (arg0, arg1, arg2) {
    const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
    return ret;
}, arguments) };

export function __wbg_buffer_95102df5554646dc() { return logError(function (arg0) {
    const ret = arg0.buffer;
    return ret;
}, arguments) };

export function __wbg_length_9254c4bd3b9f23c4() { return logError(function (arg0) {
    const ret = arg0.length;
    _assertNum(ret);
    return ret;
}, arguments) };

export function __wbg_byteLength_5d623ba3d92a3a9c() { return logError(function (arg0) {
    const ret = arg0.byteLength;
    _assertNum(ret);
    return ret;
}, arguments) };

export function __wbg_byteOffset_ec0928143c619cd7() { return logError(function (arg0) {
    const ret = arg0.byteOffset;
    _assertNum(ret);
    return ret;
}, arguments) };

export function __wbg_set_ec2fcf81bc573fd9() { return logError(function (arg0, arg1, arg2) {
    arg0.set(arg1, arg2 >>> 0);
}, arguments) };

export function __wbg_deleteProperty_7bd60d877b90e20d() { return handleError(function (arg0, arg1) {
    const ret = Reflect.deleteProperty(arg0, arg1);
    _assertBoolean(ret);
    return ret;
}, arguments) };

export function __wbg_get_ef828680c64da212() { return handleError(function (arg0, arg1) {
    const ret = Reflect.get(arg0, arg1);
    return ret;
}, arguments) };

export function __wbg_set_e864d25d9b399c9f() { return handleError(function (arg0, arg1, arg2) {
    const ret = Reflect.set(arg0, arg1, arg2);
    _assertBoolean(ret);
    return ret;
}, arguments) };

export function __wbg_buffer_ccaed51a635d8a2d() { return logError(function (arg0) {
    const ret = arg0.buffer;
    return ret;
}, arguments) };

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

export function __wbindgen_closure_wrapper1404() { return logError(function (arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 91, __wbg_adapter_26);
    return ret;
}, arguments) };

export function __wbindgen_closure_wrapper6133() { return logError(function (arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 158, __wbg_adapter_29);
    return ret;
}, arguments) };

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

