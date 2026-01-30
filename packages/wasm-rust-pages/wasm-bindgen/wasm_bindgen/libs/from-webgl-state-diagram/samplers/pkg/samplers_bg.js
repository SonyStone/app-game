let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}


function _assertBoolean(n) {
    if (typeof(n) !== 'boolean') {
        throw new Error(`expected a boolean argument, found ${typeof(n)}`);
    }
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

function _assertNum(n) {
    if (typeof(n) !== 'number') throw new Error(`expected a number argument, found ${typeof(n)}`);
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

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
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

function notDefined(what) { return () => { throw new Error(`${what} is not defined`); }; }

const AppFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_app_free(ptr >>> 0, 1));

export class App {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(App.prototype);
        obj.__wbg_ptr = ptr;
        AppFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AppFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_app_free(ptr, 0);
    }
    /**
     * is initialization code
     * @param {HTMLCanvasElement} canvas
     * @returns {App}
     */
    static new(canvas) {
        const ret = wasm.app_new(canvas);
        return App.__wrap(ret);
    }
    /**
     * is rendering code.
     */
    render() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.app_render(this.__wbg_ptr);
    }
}

export function __wbindgen_is_falsy(arg0) {
    const ret = !arg0;
    _assertBoolean(ret);
    return ret;
};

export function __wbg_instanceof_WebGl2RenderingContext_8dbe5170d8fdea28() { return logError(function (arg0) {
    let result;
    try {
        result = arg0 instanceof WebGL2RenderingContext;
    } catch (_) {
        result = false;
    }
    const ret = result;
    _assertBoolean(ret);
    return ret;
}, arguments) };

export function __wbg_bindSampler_e6594b2914f5003c() { return logError(function (arg0, arg1, arg2) {
    arg0.bindSampler(arg1 >>> 0, arg2);
}, arguments) };

export function __wbg_bindVertexArray_9971ca458d8940ea() { return logError(function (arg0, arg1) {
    arg0.bindVertexArray(arg1);
}, arguments) };

export function __wbg_bufferData_71142c71a520f034() { return logError(function (arg0, arg1, arg2, arg3, arg4) {
    arg0.bufferData(arg1 >>> 0, getArrayU8FromWasm0(arg2, arg3), arg4 >>> 0);
}, arguments) };

export function __wbg_createSampler_04ad5e8ab76483fb() { return logError(function (arg0) {
    const ret = arg0.createSampler();
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_createVertexArray_ec08b54b9f8c74ea() { return logError(function (arg0) {
    const ret = arg0.createVertexArray();
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_samplerParameteri_bba8403da2e67783() { return logError(function (arg0, arg1, arg2, arg3) {
    arg0.samplerParameteri(arg1, arg2 >>> 0, arg3);
}, arguments) };

export function __wbg_texImage2D_8fdaf5862d8d4be3() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10) {
    arg0.texImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7 >>> 0, arg8 >>> 0, arg9 === 0 ? undefined : getArrayU8FromWasm0(arg9, arg10));
}, arguments) };

export function __wbg_uniform3fv_560886b2a558fa83() { return logError(function (arg0, arg1, arg2, arg3) {
    arg0.uniform3fv(arg1, getArrayF32FromWasm0(arg2, arg3));
}, arguments) };

export function __wbg_uniform4fv_b355da0bf0a80967() { return logError(function (arg0, arg1, arg2, arg3) {
    arg0.uniform4fv(arg1, getArrayF32FromWasm0(arg2, arg3));
}, arguments) };

export function __wbg_uniformMatrix4fv_5bf1d4fcb9b38046() { return logError(function (arg0, arg1, arg2, arg3, arg4) {
    arg0.uniformMatrix4fv(arg1, arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
}, arguments) };

export function __wbg_activeTexture_a2e9931456fe92b4() { return logError(function (arg0, arg1) {
    arg0.activeTexture(arg1 >>> 0);
}, arguments) };

export function __wbg_attachShader_299671ccaa78592c() { return logError(function (arg0, arg1, arg2) {
    arg0.attachShader(arg1, arg2);
}, arguments) };

export function __wbg_bindBuffer_70e5a7ef4920142a() { return logError(function (arg0, arg1, arg2) {
    arg0.bindBuffer(arg1 >>> 0, arg2);
}, arguments) };

export function __wbg_bindTexture_78210066cfdda8ac() { return logError(function (arg0, arg1, arg2) {
    arg0.bindTexture(arg1 >>> 0, arg2);
}, arguments) };

export function __wbg_clear_678615798766f804() { return logError(function (arg0, arg1) {
    arg0.clear(arg1 >>> 0);
}, arguments) };

export function __wbg_clearColor_0af942e0c8c453eb() { return logError(function (arg0, arg1, arg2, arg3, arg4) {
    arg0.clearColor(arg1, arg2, arg3, arg4);
}, arguments) };

export function __wbg_compileShader_9680f4f1d833586c() { return logError(function (arg0, arg1) {
    arg0.compileShader(arg1);
}, arguments) };

export function __wbg_createBuffer_478457cb9beff1a3() { return logError(function (arg0) {
    const ret = arg0.createBuffer();
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_createProgram_48b8a105fd0cfb35() { return logError(function (arg0) {
    const ret = arg0.createProgram();
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_createShader_f956a5ec67a77964() { return logError(function (arg0, arg1) {
    const ret = arg0.createShader(arg1 >>> 0);
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_createTexture_3ebc81a77f42cd4b() { return logError(function (arg0) {
    const ret = arg0.createTexture();
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_deleteShader_c65ef8df50ff2e29() { return logError(function (arg0, arg1) {
    arg0.deleteShader(arg1);
}, arguments) };

export function __wbg_detachShader_edfa1d6365e56336() { return logError(function (arg0, arg1, arg2) {
    arg0.detachShader(arg1, arg2);
}, arguments) };

export function __wbg_drawElements_a40e0aeb70716911() { return logError(function (arg0, arg1, arg2, arg3, arg4) {
    arg0.drawElements(arg1 >>> 0, arg2, arg3 >>> 0, arg4);
}, arguments) };

export function __wbg_enable_b73a997042de6e09() { return logError(function (arg0, arg1) {
    arg0.enable(arg1 >>> 0);
}, arguments) };

export function __wbg_enableVertexAttribArray_08b992ae13fe30a9() { return logError(function (arg0, arg1) {
    arg0.enableVertexAttribArray(arg1 >>> 0);
}, arguments) };

export function __wbg_getAttribLocation_c498bc242afbf700() { return logError(function (arg0, arg1, arg2, arg3) {
    const ret = arg0.getAttribLocation(arg1, getStringFromWasm0(arg2, arg3));
    _assertNum(ret);
    return ret;
}, arguments) };

export function __wbg_getProgramInfoLog_16c69289b6a9c98e() { return logError(function (arg0, arg1, arg2) {
    const ret = arg1.getProgramInfoLog(arg2);
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}, arguments) };

export function __wbg_getProgramParameter_4c981ddc3b62dda8() { return logError(function (arg0, arg1, arg2) {
    const ret = arg0.getProgramParameter(arg1, arg2 >>> 0);
    return ret;
}, arguments) };

export function __wbg_getShaderInfoLog_afb2baaac4baaff5() { return logError(function (arg0, arg1, arg2) {
    const ret = arg1.getShaderInfoLog(arg2);
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}, arguments) };

export function __wbg_getShaderParameter_e21fb00f8255b86b() { return logError(function (arg0, arg1, arg2) {
    const ret = arg0.getShaderParameter(arg1, arg2 >>> 0);
    return ret;
}, arguments) };

export function __wbg_getUniformLocation_74149153bba4c4cb() { return logError(function (arg0, arg1, arg2, arg3) {
    const ret = arg0.getUniformLocation(arg1, getStringFromWasm0(arg2, arg3));
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_linkProgram_983c5972b815b0de() { return logError(function (arg0, arg1) {
    arg0.linkProgram(arg1);
}, arguments) };

export function __wbg_shaderSource_c36f18b5114855e7() { return logError(function (arg0, arg1, arg2, arg3) {
    arg0.shaderSource(arg1, getStringFromWasm0(arg2, arg3));
}, arguments) };

export function __wbg_texParameteri_a73df30f47a92fec() { return logError(function (arg0, arg1, arg2, arg3) {
    arg0.texParameteri(arg1 >>> 0, arg2 >>> 0, arg3);
}, arguments) };

export function __wbg_uniform1i_b7abcc7b3b4aee52() { return logError(function (arg0, arg1, arg2) {
    arg0.uniform1i(arg1, arg2);
}, arguments) };

export function __wbg_useProgram_8232847dbf97643a() { return logError(function (arg0, arg1) {
    arg0.useProgram(arg1);
}, arguments) };

export function __wbg_vertexAttribPointer_f602d22ecb0758f6() { return logError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    arg0.vertexAttribPointer(arg1 >>> 0, arg2, arg3 >>> 0, arg4 !== 0, arg5, arg6);
}, arguments) };

export function __wbg_viewport_e333f63662d91f3a() { return logError(function (arg0, arg1, arg2, arg3, arg4) {
    arg0.viewport(arg1, arg2, arg3, arg4);
}, arguments) };

export function __wbg_clientWidth_600f98ddd2b6cb36() { return logError(function (arg0) {
    const ret = arg0.clientWidth;
    _assertNum(ret);
    return ret;
}, arguments) };

export function __wbg_clientHeight_0f17075303285b38() { return logError(function (arg0) {
    const ret = arg0.clientHeight;
    _assertNum(ret);
    return ret;
}, arguments) };

export const __wbg_error_53abcd6a461f73d8 = typeof console.error == 'function' ? console.error : notDefined('console.error');

export function __wbg_width_cd62a064492c4489() { return logError(function (arg0) {
    const ret = arg0.width;
    _assertNum(ret);
    return ret;
}, arguments) };

export function __wbg_height_f9f3ea69baf38ed4() { return logError(function (arg0) {
    const ret = arg0.height;
    _assertNum(ret);
    return ret;
}, arguments) };

export function __wbg_getContext_bf8985355a4d22ca() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbindgen_string_new(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
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

