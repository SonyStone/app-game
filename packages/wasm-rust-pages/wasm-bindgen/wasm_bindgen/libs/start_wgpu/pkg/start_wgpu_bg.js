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
function __wbg_adapter_30(arg0, arg1, arg2) {
    wasm.closure107_externref_shim(arg0, arg1, arg2);
}

function __wbg_adapter_35(arg0, arg1, arg2) {
    wasm.closure235_externref_shim(arg0, arg1, arg2);
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

function notDefined(what) { return () => { throw new Error(`${what} is not defined`); }; }

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
function __wbg_adapter_371(arg0, arg1, arg2, arg3) {
    wasm.closure261_externref_shim(arg0, arg1, arg2, arg3);
}

const __wbindgen_enum_GpuAddressMode = ["clamp-to-edge", "repeat", "mirror-repeat"];

const __wbindgen_enum_GpuAutoLayoutMode = ["auto"];

const __wbindgen_enum_GpuBlendFactor = ["zero", "one", "src", "one-minus-src", "src-alpha", "one-minus-src-alpha", "dst", "one-minus-dst", "dst-alpha", "one-minus-dst-alpha", "src-alpha-saturated", "constant", "one-minus-constant"];

const __wbindgen_enum_GpuBlendOperation = ["add", "subtract", "reverse-subtract", "min", "max"];

const __wbindgen_enum_GpuBufferBindingType = ["uniform", "storage", "read-only-storage"];

const __wbindgen_enum_GpuBufferMapState = ["unmapped", "pending", "mapped"];

const __wbindgen_enum_GpuCanvasAlphaMode = ["opaque", "premultiplied"];

const __wbindgen_enum_GpuCompareFunction = ["never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"];

const __wbindgen_enum_GpuCompilationMessageType = ["error", "warning", "info"];

const __wbindgen_enum_GpuCullMode = ["none", "front", "back"];

const __wbindgen_enum_GpuDeviceLostReason = ["unknown", "destroyed"];

const __wbindgen_enum_GpuErrorFilter = ["validation", "out-of-memory", "internal"];

const __wbindgen_enum_GpuFeatureName = ["depth-clip-control", "depth32float-stencil8", "texture-compression-bc", "texture-compression-bc-sliced-3d", "texture-compression-etc2", "texture-compression-astc", "timestamp-query", "indirect-first-instance", "shader-f16", "rg11b10ufloat-renderable", "bgra8unorm-storage", "float32-filterable"];

const __wbindgen_enum_GpuFilterMode = ["nearest", "linear"];

const __wbindgen_enum_GpuFrontFace = ["ccw", "cw"];

const __wbindgen_enum_GpuIndexFormat = ["uint16", "uint32"];

const __wbindgen_enum_GpuLoadOp = ["load", "clear"];

const __wbindgen_enum_GpuMipmapFilterMode = ["nearest", "linear"];

const __wbindgen_enum_GpuPowerPreference = ["low-power", "high-performance"];

const __wbindgen_enum_GpuPrimitiveTopology = ["point-list", "line-list", "line-strip", "triangle-list", "triangle-strip"];

const __wbindgen_enum_GpuQueryType = ["occlusion", "timestamp"];

const __wbindgen_enum_GpuSamplerBindingType = ["filtering", "non-filtering", "comparison"];

const __wbindgen_enum_GpuStencilOperation = ["keep", "zero", "replace", "invert", "increment-clamp", "decrement-clamp", "increment-wrap", "decrement-wrap"];

const __wbindgen_enum_GpuStorageTextureAccess = ["write-only", "read-only", "read-write"];

const __wbindgen_enum_GpuStoreOp = ["store", "discard"];

const __wbindgen_enum_GpuTextureAspect = ["all", "stencil-only", "depth-only"];

const __wbindgen_enum_GpuTextureDimension = ["1d", "2d", "3d"];

const __wbindgen_enum_GpuTextureFormat = ["r8unorm", "r8snorm", "r8uint", "r8sint", "r16uint", "r16sint", "r16float", "rg8unorm", "rg8snorm", "rg8uint", "rg8sint", "r32uint", "r32sint", "r32float", "rg16uint", "rg16sint", "rg16float", "rgba8unorm", "rgba8unorm-srgb", "rgba8snorm", "rgba8uint", "rgba8sint", "bgra8unorm", "bgra8unorm-srgb", "rgb9e5ufloat", "rgb10a2uint", "rgb10a2unorm", "rg11b10ufloat", "rg32uint", "rg32sint", "rg32float", "rgba16uint", "rgba16sint", "rgba16float", "rgba32uint", "rgba32sint", "rgba32float", "stencil8", "depth16unorm", "depth24plus", "depth24plus-stencil8", "depth32float", "depth32float-stencil8", "bc1-rgba-unorm", "bc1-rgba-unorm-srgb", "bc2-rgba-unorm", "bc2-rgba-unorm-srgb", "bc3-rgba-unorm", "bc3-rgba-unorm-srgb", "bc4-r-unorm", "bc4-r-snorm", "bc5-rg-unorm", "bc5-rg-snorm", "bc6h-rgb-ufloat", "bc6h-rgb-float", "bc7-rgba-unorm", "bc7-rgba-unorm-srgb", "etc2-rgb8unorm", "etc2-rgb8unorm-srgb", "etc2-rgb8a1unorm", "etc2-rgb8a1unorm-srgb", "etc2-rgba8unorm", "etc2-rgba8unorm-srgb", "eac-r11unorm", "eac-r11snorm", "eac-rg11unorm", "eac-rg11snorm", "astc-4x4-unorm", "astc-4x4-unorm-srgb", "astc-5x4-unorm", "astc-5x4-unorm-srgb", "astc-5x5-unorm", "astc-5x5-unorm-srgb", "astc-6x5-unorm", "astc-6x5-unorm-srgb", "astc-6x6-unorm", "astc-6x6-unorm-srgb", "astc-8x5-unorm", "astc-8x5-unorm-srgb", "astc-8x6-unorm", "astc-8x6-unorm-srgb", "astc-8x8-unorm", "astc-8x8-unorm-srgb", "astc-10x5-unorm", "astc-10x5-unorm-srgb", "astc-10x6-unorm", "astc-10x6-unorm-srgb", "astc-10x8-unorm", "astc-10x8-unorm-srgb", "astc-10x10-unorm", "astc-10x10-unorm-srgb", "astc-12x10-unorm", "astc-12x10-unorm-srgb", "astc-12x12-unorm", "astc-12x12-unorm-srgb"];

const __wbindgen_enum_GpuTextureSampleType = ["float", "unfilterable-float", "depth", "sint", "uint"];

const __wbindgen_enum_GpuTextureViewDimension = ["1d", "2d", "2d-array", "cube", "cube-array", "3d"];

const __wbindgen_enum_GpuVertexFormat = ["uint8x2", "uint8x4", "sint8x2", "sint8x4", "unorm8x2", "unorm8x4", "snorm8x2", "snorm8x4", "uint16x2", "uint16x4", "sint16x2", "sint16x4", "unorm16x2", "unorm16x4", "snorm16x2", "snorm16x4", "float16x2", "float16x4", "float32", "float32x2", "float32x3", "float32x4", "uint32", "uint32x2", "uint32x3", "uint32x4", "sint32", "sint32x2", "sint32x3", "sint32x4", "unorm10-10-10-2"];

const __wbindgen_enum_GpuVertexStepMode = ["vertex", "instance"];

const HelloTriangleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_hellotriangle_free(ptr >>> 0, 1));

export class HelloTriangle {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(HelloTriangle.prototype);
        obj.__wbg_ptr = ptr;
        HelloTriangleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        HelloTriangleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_hellotriangle_free(ptr, 0);
    }
    /**
     * @param {HTMLCanvasElement} canvas
     * @returns {Promise<HelloTriangle>}
     */
    static new(canvas) {
        const ret = wasm.hellotriangle_new(canvas);
        return ret;
    }
    /**
     * @param {number} height
     * @param {number} width
     */
    resize(height, width) {
        wasm.hellotriangle_resize(this.__wbg_ptr, height, width);
    }
    redraw() {
        wasm.hellotriangle_redraw(this.__wbg_ptr);
    }
}

export function __wbindgen_string_new(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
};

export function __wbg_hellotriangle_new(arg0) {
    const ret = HelloTriangle.__wrap(arg0);
    return ret;
};

export function __wbg_instanceof_GpuDeviceLostInfo_41477e03ab828a57(arg0) {
    let result;
    try {
        result = arg0 instanceof GPUDeviceLostInfo;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbindgen_number_new(arg0) {
    const ret = arg0;
    return ret;
};

export function __wbg_instanceof_GpuCanvasContext_c1c662346b1c4c0f(arg0) {
    let result;
    try {
        result = arg0 instanceof GPUCanvasContext;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_configure_976757a80d302cfd(arg0, arg1) {
    arg0.configure(arg1);
};

export function __wbg_getCurrentTexture_420338538b7ba985(arg0) {
    const ret = arg0.getCurrentTexture();
    return ret;
};

export function __wbg_features_25609cb5b26e1fd0(arg0) {
    const ret = arg0.features;
    return ret;
};

export function __wbg_limits_d36e71d6d7040d86(arg0) {
    const ret = arg0.limits;
    return ret;
};

export function __wbg_queue_6ef67d5d8110c3f5(arg0) {
    const ret = arg0.queue;
    return ret;
};

export function __wbg_lost_2ab73d2899cf37ae(arg0) {
    const ret = arg0.lost;
    return ret;
};

export function __wbg_setonuncapturederror_4985951b1d7410d2(arg0, arg1) {
    arg0.onuncapturederror = arg1;
};

export function __wbg_createBindGroup_e4b09a8d973011fc(arg0, arg1) {
    const ret = arg0.createBindGroup(arg1);
    return ret;
};

export function __wbg_createBindGroupLayout_df383f8bf0b92d07(arg0, arg1) {
    const ret = arg0.createBindGroupLayout(arg1);
    return ret;
};

export function __wbg_createBuffer_b1bc31416c42f297(arg0, arg1) {
    const ret = arg0.createBuffer(arg1);
    return ret;
};

export function __wbg_createCommandEncoder_33558979c5d6bc2c(arg0, arg1) {
    const ret = arg0.createCommandEncoder(arg1);
    return ret;
};

export function __wbg_createComputePipeline_ea9e27db9e0d8cd0(arg0, arg1) {
    const ret = arg0.createComputePipeline(arg1);
    return ret;
};

export function __wbg_createPipelineLayout_85c441e2e9178d3a(arg0, arg1) {
    const ret = arg0.createPipelineLayout(arg1);
    return ret;
};

export function __wbg_createQuerySet_a05d99f32d2ea788(arg0, arg1) {
    const ret = arg0.createQuerySet(arg1);
    return ret;
};

export function __wbg_createRenderBundleEncoder_72b42576dd655e11(arg0, arg1) {
    const ret = arg0.createRenderBundleEncoder(arg1);
    return ret;
};

export function __wbg_createRenderPipeline_19b6f05f57979c41(arg0, arg1) {
    const ret = arg0.createRenderPipeline(arg1);
    return ret;
};

export function __wbg_createSampler_1f071ec702ef29a1(arg0, arg1) {
    const ret = arg0.createSampler(arg1);
    return ret;
};

export function __wbg_createShaderModule_cdb96ffd7bfd5a7e(arg0, arg1) {
    const ret = arg0.createShaderModule(arg1);
    return ret;
};

export function __wbg_createTexture_37bc5632c49e0300(arg0, arg1) {
    const ret = arg0.createTexture(arg1);
    return ret;
};

export function __wbg_destroy_05b9c94f09626d87(arg0) {
    arg0.destroy();
};

export function __wbg_popErrorScope_b18c32a5b029034a(arg0) {
    const ret = arg0.popErrorScope();
    return ret;
};

export function __wbg_pushErrorScope_ea13ac1917404b6b(arg0, arg1) {
    arg0.pushErrorScope(__wbindgen_enum_GpuErrorFilter[arg1]);
};

export function __wbindgen_string_get(arg0, arg1) {
    const obj = arg1;
    const ret = typeof(obj) === 'string' ? obj : undefined;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_getBindGroupLayout_2a903c8c2763beda(arg0, arg1) {
    const ret = arg0.getBindGroupLayout(arg1 >>> 0);
    return ret;
};

export function __wbg_getPreferredCanvasFormat_2aa46519bfbb53cb(arg0) {
    const ret = arg0.getPreferredCanvasFormat();
    return (__wbindgen_enum_GpuTextureFormat.indexOf(ret) + 1 || 96) - 1;
};

export function __wbg_requestAdapter_0e755ec16adfeaef(arg0, arg1) {
    const ret = arg0.requestAdapter(arg1);
    return ret;
};

export function __wbg_type_aa4599218a4504a9(arg0) {
    const ret = arg0.type;
    return (__wbindgen_enum_GpuCompilationMessageType.indexOf(ret) + 1 || 4) - 1;
};

export function __wbg_offset_d6f534a7d1b7dfb7(arg0) {
    const ret = arg0.offset;
    return ret;
};

export function __wbg_length_b93be778d569f6d1(arg0) {
    const ret = arg0.length;
    return ret;
};

export function __wbg_error_6e98b2c536866396(arg0) {
    const ret = arg0.error;
    return ret;
};

export function __wbindgen_cb_drop(arg0) {
    const obj = arg0.original;
    if (obj.cnt-- == 1) {
        obj.a = 0;
        return true;
    }
    const ret = false;
    return ret;
};

export function __wbg_reason_dae22a3bfa9841bc(arg0) {
    const ret = arg0.reason;
    return (__wbindgen_enum_GpuDeviceLostReason.indexOf(ret) + 1 || 3) - 1;
};

export function __wbg_message_f1550ccb6b4cd501(arg0, arg1) {
    const ret = arg1.message;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_has_6e4fe17357847090(arg0, arg1, arg2) {
    const ret = arg0.has(getStringFromWasm0(arg1, arg2));
    return ret;
};

export function __wbg_maxTextureDimension1D_39a585636aa1f887(arg0) {
    const ret = arg0.maxTextureDimension1D;
    return ret;
};

export function __wbg_maxTextureDimension2D_ad386ba70b28add7(arg0) {
    const ret = arg0.maxTextureDimension2D;
    return ret;
};

export function __wbg_maxTextureDimension3D_fa439f57569983e8(arg0) {
    const ret = arg0.maxTextureDimension3D;
    return ret;
};

export function __wbg_maxTextureArrayLayers_6f2126c6a6b5cd3a(arg0) {
    const ret = arg0.maxTextureArrayLayers;
    return ret;
};

export function __wbg_maxBindGroups_387af0e2df7a0899(arg0) {
    const ret = arg0.maxBindGroups;
    return ret;
};

export function __wbg_maxBindingsPerBindGroup_0573ee7383e3de0f(arg0) {
    const ret = arg0.maxBindingsPerBindGroup;
    return ret;
};

export function __wbg_maxDynamicUniformBuffersPerPipelineLayout_54f7227735b1a1c8(arg0) {
    const ret = arg0.maxDynamicUniformBuffersPerPipelineLayout;
    return ret;
};

export function __wbg_maxDynamicStorageBuffersPerPipelineLayout_bcba2879b0a68934(arg0) {
    const ret = arg0.maxDynamicStorageBuffersPerPipelineLayout;
    return ret;
};

export function __wbg_maxSampledTexturesPerShaderStage_aaaa29142184370e(arg0) {
    const ret = arg0.maxSampledTexturesPerShaderStage;
    return ret;
};

export function __wbg_maxSamplersPerShaderStage_d4a512e5c2e75750(arg0) {
    const ret = arg0.maxSamplersPerShaderStage;
    return ret;
};

export function __wbg_maxStorageBuffersPerShaderStage_06cf7b6bb9efed5b(arg0) {
    const ret = arg0.maxStorageBuffersPerShaderStage;
    return ret;
};

export function __wbg_maxStorageTexturesPerShaderStage_5ddfc8c3c6a7407c(arg0) {
    const ret = arg0.maxStorageTexturesPerShaderStage;
    return ret;
};

export function __wbg_maxUniformBuffersPerShaderStage_0f230b1ff21ad339(arg0) {
    const ret = arg0.maxUniformBuffersPerShaderStage;
    return ret;
};

export function __wbg_maxUniformBufferBindingSize_d46972129f70db3c(arg0) {
    const ret = arg0.maxUniformBufferBindingSize;
    return ret;
};

export function __wbg_maxStorageBufferBindingSize_6cbb30305855d1aa(arg0) {
    const ret = arg0.maxStorageBufferBindingSize;
    return ret;
};

export function __wbg_maxVertexBuffers_21f3262fe209faa7(arg0) {
    const ret = arg0.maxVertexBuffers;
    return ret;
};

export function __wbg_maxBufferSize_015ab0aabd1b8b0c(arg0) {
    const ret = arg0.maxBufferSize;
    return ret;
};

export function __wbg_maxVertexAttributes_1b5a9857411b5de4(arg0) {
    const ret = arg0.maxVertexAttributes;
    return ret;
};

export function __wbg_maxVertexBufferArrayStride_ff07dd39a2f4873e(arg0) {
    const ret = arg0.maxVertexBufferArrayStride;
    return ret;
};

export function __wbg_minUniformBufferOffsetAlignment_602c6fb6e1ffbfec(arg0) {
    const ret = arg0.minUniformBufferOffsetAlignment;
    return ret;
};

export function __wbg_minStorageBufferOffsetAlignment_e00936b91385cbea(arg0) {
    const ret = arg0.minStorageBufferOffsetAlignment;
    return ret;
};

export function __wbg_maxColorAttachments_449c99990b4160fc(arg0) {
    const ret = arg0.maxColorAttachments;
    return ret;
};

export function __wbg_maxColorAttachmentBytesPerSample_6923be774ed637a0(arg0) {
    const ret = arg0.maxColorAttachmentBytesPerSample;
    return ret;
};

export function __wbg_maxComputeWorkgroupStorageSize_9d4fdde1e82b289a(arg0) {
    const ret = arg0.maxComputeWorkgroupStorageSize;
    return ret;
};

export function __wbg_maxComputeInvocationsPerWorkgroup_d4007fc417128249(arg0) {
    const ret = arg0.maxComputeInvocationsPerWorkgroup;
    return ret;
};

export function __wbg_maxComputeWorkgroupSizeX_e66acc451c1e3c0e(arg0) {
    const ret = arg0.maxComputeWorkgroupSizeX;
    return ret;
};

export function __wbg_maxComputeWorkgroupSizeY_1eb81e9b6186d667(arg0) {
    const ret = arg0.maxComputeWorkgroupSizeY;
    return ret;
};

export function __wbg_maxComputeWorkgroupSizeZ_c888e5f09da8121d(arg0) {
    const ret = arg0.maxComputeWorkgroupSizeZ;
    return ret;
};

export function __wbg_maxComputeWorkgroupsPerDimension_ebb12adf1265964c(arg0) {
    const ret = arg0.maxComputeWorkgroupsPerDimension;
    return ret;
};

export function __wbg_instanceof_GpuAdapter_2255bf01fe346ea6(arg0) {
    let result;
    try {
        result = arg0 instanceof GPUAdapter;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbindgen_is_object(arg0) {
    const val = arg0;
    const ret = typeof(val) === 'object' && val !== null;
    return ret;
};

export function __wbg_getMappedRange_c5df829b44191b60(arg0, arg1, arg2) {
    const ret = arg0.getMappedRange(arg1, arg2);
    return ret;
};

export function __wbg_Window_5218851f504502e0(arg0) {
    const ret = arg0.Window;
    return ret;
};

export function __wbindgen_is_undefined(arg0) {
    const ret = arg0 === undefined;
    return ret;
};

export function __wbg_WorkerGlobalScope_d5db9a438aec6722(arg0) {
    const ret = arg0.WorkerGlobalScope;
    return ret;
};

export function __wbg_gpu_bd990a3d2b27943b(arg0) {
    const ret = arg0.gpu;
    return ret;
};

export function __wbindgen_is_null(arg0) {
    const ret = arg0 === null;
    return ret;
};

export function __wbg_requestDevice_eba3ff45d2dc6b81(arg0, arg1) {
    const ret = arg0.requestDevice(arg1);
    return ret;
};

export function __wbg_features_9424a9acd57806c3(arg0) {
    const ret = arg0.features;
    return ret;
};

export function __wbg_limits_26190d8f1cda84fc(arg0) {
    const ret = arg0.limits;
    return ret;
};

export function __wbg_mapAsync_2871e35eccd9c638(arg0, arg1, arg2, arg3) {
    const ret = arg0.mapAsync(arg1 >>> 0, arg2, arg3);
    return ret;
};

export function __wbg_unmap_d6ae7bed8545c9c3(arg0) {
    arg0.unmap();
};

export function __wbg_getCompilationInfo_f08dbc26bdf70876(arg0) {
    const ret = arg0.getCompilationInfo();
    return ret;
};

export function __wbg_messages_1eec5fe818d17b6b(arg0) {
    const ret = arg0.messages;
    return ret;
};

export function __wbg_createView_0de22df992b9a18e(arg0, arg1) {
    const ret = arg0.createView(arg1);
    return ret;
};

export function __wbg_destroy_5ec9bba627335ed6(arg0) {
    arg0.destroy();
};

export function __wbg_destroy_d04a61262a16f9c0(arg0) {
    arg0.destroy();
};

export function __wbg_getBindGroupLayout_8e5043f942e08ea3(arg0, arg1) {
    const ret = arg0.getBindGroupLayout(arg1 >>> 0);
    return ret;
};

export function __wbg_copyBufferToBuffer_da8918f17714be10(arg0, arg1, arg2, arg3, arg4, arg5) {
    arg0.copyBufferToBuffer(arg1, arg2, arg3, arg4, arg5);
};

export function __wbg_copyBufferToTexture_9bcb8a8c9942c679(arg0, arg1, arg2, arg3) {
    arg0.copyBufferToTexture(arg1, arg2, arg3);
};

export function __wbg_copyTextureToBuffer_6c3caf51a11ebf7e(arg0, arg1, arg2, arg3) {
    arg0.copyTextureToBuffer(arg1, arg2, arg3);
};

export function __wbg_copyTextureToTexture_3388bf3120de4459(arg0, arg1, arg2, arg3) {
    arg0.copyTextureToTexture(arg1, arg2, arg3);
};

export function __wbg_beginComputePass_1f918279b0916561(arg0, arg1) {
    const ret = arg0.beginComputePass(arg1);
    return ret;
};

export function __wbg_beginRenderPass_994bb5571da69860(arg0, arg1) {
    const ret = arg0.beginRenderPass(arg1);
    return ret;
};

export function __wbg_label_8ccf50234e7473f1(arg0, arg1) {
    const ret = arg1.label;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_finish_01606e2e87f5db65(arg0) {
    const ret = arg0.finish();
    return ret;
};

export function __wbg_finish_b6efa0956f569b51(arg0, arg1) {
    const ret = arg0.finish(arg1);
    return ret;
};

export function __wbg_clearBuffer_b17657c2f424ab7c(arg0, arg1, arg2) {
    arg0.clearBuffer(arg1, arg2);
};

export function __wbg_clearBuffer_dfa40698c0ae3159(arg0, arg1, arg2, arg3) {
    arg0.clearBuffer(arg1, arg2, arg3);
};

export function __wbg_resolveQuerySet_77fba260382a69bb(arg0, arg1, arg2, arg3, arg4, arg5) {
    arg0.resolveQuerySet(arg1, arg2 >>> 0, arg3 >>> 0, arg4, arg5 >>> 0);
};

export function __wbg_finish_ba5339911e834d90(arg0) {
    const ret = arg0.finish();
    return ret;
};

export function __wbg_finish_fac6541f20015daa(arg0, arg1) {
    const ret = arg0.finish(arg1);
    return ret;
};

export function __wbg_writeBuffer_d590978cde5aa5b5(arg0, arg1, arg2, arg3, arg4, arg5) {
    arg0.writeBuffer(arg1, arg2, arg3, arg4, arg5);
};

export function __wbg_usage_6241854043909e78(arg0) {
    const ret = arg0.usage;
    return ret;
};

export function __wbg_size_f7a907982b8d3923(arg0) {
    const ret = arg0.size;
    return ret;
};

export function __wbg_writeTexture_4169ceaca5e8175a(arg0, arg1, arg2, arg3, arg4) {
    arg0.writeTexture(arg1, arg2, arg3, arg4);
};

export function __wbg_copyExternalImageToTexture_bc2817a25f93a147(arg0, arg1, arg2, arg3) {
    arg0.copyExternalImageToTexture(arg1, arg2, arg3);
};

export function __wbg_setPipeline_2bf8b9c49a14c6b1(arg0, arg1) {
    arg0.setPipeline(arg1);
};

export function __wbg_setBindGroup_55fc30bfc85bfed5(arg0, arg1, arg2) {
    arg0.setBindGroup(arg1 >>> 0, arg2);
};

export function __wbg_setBindGroup_fc44dbd1b3de302b(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    arg0.setBindGroup(arg1 >>> 0, arg2, getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
};

export function __wbg_dispatchWorkgroups_c81d0f657b22ad07(arg0, arg1, arg2, arg3) {
    arg0.dispatchWorkgroups(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0);
};

export function __wbg_dispatchWorkgroupsIndirect_60aed932f169c64a(arg0, arg1, arg2) {
    arg0.dispatchWorkgroupsIndirect(arg1, arg2);
};

export function __wbg_end_1910c08a8b7611fd(arg0) {
    arg0.end();
};

export function __wbg_setPipeline_ff7f1e88b8b347d4(arg0, arg1) {
    arg0.setPipeline(arg1);
};

export function __wbg_setBindGroup_c9d85c4405625b15(arg0, arg1, arg2) {
    arg0.setBindGroup(arg1 >>> 0, arg2);
};

export function __wbg_setBindGroup_bb8377df5847a439(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    arg0.setBindGroup(arg1 >>> 0, arg2, getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
};

export function __wbg_setIndexBuffer_3106c3f8eaf9463f(arg0, arg1, arg2, arg3) {
    arg0.setIndexBuffer(arg1, __wbindgen_enum_GpuIndexFormat[arg2], arg3);
};

export function __wbg_setIndexBuffer_80c98d6a3f8d63a8(arg0, arg1, arg2, arg3, arg4) {
    arg0.setIndexBuffer(arg1, __wbindgen_enum_GpuIndexFormat[arg2], arg3, arg4);
};

export function __wbg_setVertexBuffer_adedf8ced203322c(arg0, arg1, arg2, arg3) {
    arg0.setVertexBuffer(arg1 >>> 0, arg2, arg3);
};

export function __wbg_setVertexBuffer_1c9a823b0dc529c4(arg0, arg1, arg2, arg3, arg4) {
    arg0.setVertexBuffer(arg1 >>> 0, arg2, arg3, arg4);
};

export function __wbg_draw_09103e787224c7bb(arg0, arg1, arg2, arg3, arg4) {
    arg0.draw(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
};

export function __wbg_drawIndexed_a73cc9f9d7fd3199(arg0, arg1, arg2, arg3, arg4, arg5) {
    arg0.drawIndexed(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4, arg5 >>> 0);
};

export function __wbg_drawIndirect_e20449dbb9a76b56(arg0, arg1, arg2) {
    arg0.drawIndirect(arg1, arg2);
};

export function __wbg_drawIndexedIndirect_525f4c59111f3ca4(arg0, arg1, arg2) {
    arg0.drawIndexedIndirect(arg1, arg2);
};

export function __wbg_setPipeline_abff4492c059e8bc(arg0, arg1) {
    arg0.setPipeline(arg1);
};

export function __wbg_setBindGroup_4f728282101654ea(arg0, arg1, arg2) {
    arg0.setBindGroup(arg1 >>> 0, arg2);
};

export function __wbg_setBindGroup_957d97d5d74f2495(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    arg0.setBindGroup(arg1 >>> 0, arg2, getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
};

export function __wbg_setIndexBuffer_9d2960b6ddcb8da5(arg0, arg1, arg2, arg3) {
    arg0.setIndexBuffer(arg1, __wbindgen_enum_GpuIndexFormat[arg2], arg3);
};

export function __wbg_setIndexBuffer_14953d5e5868b711(arg0, arg1, arg2, arg3, arg4) {
    arg0.setIndexBuffer(arg1, __wbindgen_enum_GpuIndexFormat[arg2], arg3, arg4);
};

export function __wbg_setVertexBuffer_b81d5f5cdcb9d231(arg0, arg1, arg2, arg3) {
    arg0.setVertexBuffer(arg1 >>> 0, arg2, arg3);
};

export function __wbg_setVertexBuffer_3e5c21164c51a5eb(arg0, arg1, arg2, arg3, arg4) {
    arg0.setVertexBuffer(arg1 >>> 0, arg2, arg3, arg4);
};

export function __wbg_draw_648a7e9b9782bb7e(arg0, arg1, arg2, arg3, arg4) {
    arg0.draw(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
};

export function __wbg_drawIndexed_27c45c01331a599c(arg0, arg1, arg2, arg3, arg4, arg5) {
    arg0.drawIndexed(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4, arg5 >>> 0);
};

export function __wbg_drawIndirect_2693c246e524ac64(arg0, arg1, arg2) {
    arg0.drawIndirect(arg1, arg2);
};

export function __wbg_drawIndexedIndirect_6168495207760cf6(arg0, arg1, arg2) {
    arg0.drawIndexedIndirect(arg1, arg2);
};

export function __wbg_setBlendConstant_61a55530d4da890f(arg0, arg1) {
    arg0.setBlendConstant(arg1);
};

export function __wbg_setScissorRect_b1384bdd48a8198e(arg0, arg1, arg2, arg3, arg4) {
    arg0.setScissorRect(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
};

export function __wbg_setViewport_0a7994521fb619c2(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    arg0.setViewport(arg1, arg2, arg3, arg4, arg5, arg6);
};

export function __wbg_setStencilReference_b88790f7471faa50(arg0, arg1) {
    arg0.setStencilReference(arg1 >>> 0);
};

export function __wbg_executeBundles_0224159bfd92604f(arg0, arg1) {
    arg0.executeBundles(arg1);
};

export function __wbg_end_4aff02a93037feb4(arg0) {
    arg0.end();
};

export function __wbg_submit_fce1c38557836c6c(arg0, arg1) {
    arg0.submit(arg1);
};

export function __wbg_lineNum_88fdd333d4441e7b(arg0) {
    const ret = arg0.lineNum;
    return ret;
};

export function __wbg_message_7fa4c77784458a7b(arg0, arg1) {
    const ret = arg1.message;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_message_a1b6d4a58706fce1(arg0, arg1) {
    const ret = arg1.message;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_instanceof_GpuValidationError_7003dd8a13defedd(arg0) {
    let result;
    try {
        result = arg0 instanceof GPUValidationError;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_instanceof_GpuOutOfMemoryError_7cc2a1bc9e21af9f(arg0) {
    let result;
    try {
        result = arg0 instanceof GPUOutOfMemoryError;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_queueMicrotask_848aa4969108a57e(arg0) {
    const ret = arg0.queueMicrotask;
    return ret;
};

export function __wbindgen_is_function(arg0) {
    const ret = typeof(arg0) === 'function';
    return ret;
};

export const __wbg_queueMicrotask_c5419c06eab41e73 = typeof queueMicrotask == 'function' ? queueMicrotask : notDefined('queueMicrotask');

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

export function __wbg_navigator_3d3836196a5d8e62(arg0) {
    const ret = arg0.navigator;
    return ret;
};

export function __wbg_querySelectorAll_28e417f74795a70f() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.querySelectorAll(getStringFromWasm0(arg1, arg2));
    return ret;
}, arguments) };

export function __wbg_navigator_4093e51a109a906e(arg0) {
    const ret = arg0.navigator;
    return ret;
};

export const __wbg_error_53abcd6a461f73d8 = typeof console.error == 'function' ? console.error : notDefined('console.error');

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

export function __wbg_get_602f2a39a831c929(arg0, arg1) {
    const ret = arg0[arg1 >>> 0];
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
};

export function __wbg_setwidth_e02ce7ae3e45c1b6(arg0, arg1) {
    arg0.width = arg1 >>> 0;
};

export function __wbg_setheight_45e518143d1ca78f(arg0, arg1) {
    arg0.height = arg1 >>> 0;
};

export function __wbg_getContext_211e7f0e615215a4() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_get_5419cf6b954aa11d(arg0, arg1) {
    const ret = arg0[arg1 >>> 0];
    return ret;
};

export function __wbg_length_f217bbbf7e8e4df4(arg0) {
    const ret = arg0.length;
    return ret;
};

export function __wbg_new_034f913e7636e987() {
    const ret = new Array();
    return ret;
};

export function __wbg_newnoargs_1ede4bf2ebbaaf43(arg0, arg1) {
    const ret = new Function(getStringFromWasm0(arg0, arg1));
    return ret;
};

export function __wbg_call_a9ef466721e824f2() { return handleError(function (arg0, arg1) {
    const ret = arg0.call(arg1);
    return ret;
}, arguments) };

export function __wbg_new_e69b5f66fda8f13c() {
    const ret = new Object();
    return ret;
};

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

export function __wbg_push_36cf4d81d7da33d1(arg0, arg1) {
    const ret = arg0.push(arg1);
    return ret;
};

export function __wbg_call_3bfa248576352471() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.call(arg1, arg2);
    return ret;
}, arguments) };

export function __wbg_instanceof_Object_4bbac482eda9b711(arg0) {
    let result;
    try {
        result = arg0 instanceof Object;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_valueOf_caadbb280a0b350a(arg0) {
    const ret = arg0.valueOf();
    return ret;
};

export function __wbg_new_1073970097e5a420(arg0, arg1) {
    try {
        var state0 = {a: arg0, b: arg1};
        var cb0 = (arg0, arg1) => {
            const a = state0.a;
            state0.a = 0;
            try {
                return __wbg_adapter_371(a, state0.b, arg0, arg1);
            } finally {
                state0.a = a;
            }
        };
        const ret = new Promise(cb0);
        return ret;
    } finally {
        state0.a = state0.b = 0;
    }
};

export function __wbg_resolve_0aad7c1484731c99(arg0) {
    const ret = Promise.resolve(arg0);
    return ret;
};

export function __wbg_then_748f75edfb032440(arg0, arg1) {
    const ret = arg0.then(arg1);
    return ret;
};

export function __wbg_then_4866a7d9f55d8f3e(arg0, arg1, arg2) {
    const ret = arg0.then(arg1, arg2);
    return ret;
};

export function __wbg_buffer_ccaed51a635d8a2d(arg0) {
    const ret = arg0.buffer;
    return ret;
};

export function __wbg_newwithbyteoffsetandlength_7e3eb787208af730(arg0, arg1, arg2) {
    const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
    return ret;
};

export function __wbg_new_fec2611eb9180f95(arg0) {
    const ret = new Uint8Array(arg0);
    return ret;
};

export function __wbg_set_ec2fcf81bc573fd9(arg0, arg1, arg2) {
    arg0.set(arg1, arg2 >>> 0);
};

export function __wbg_length_9254c4bd3b9f23c4(arg0) {
    const ret = arg0.length;
    return ret;
};

export function __wbg_buffer_95102df5554646dc(arg0) {
    const ret = arg0.buffer;
    return ret;
};

export function __wbg_set_e864d25d9b399c9f() { return handleError(function (arg0, arg1, arg2) {
    const ret = Reflect.set(arg0, arg1, arg2);
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

export function __wbindgen_closure_wrapper759(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 108, __wbg_adapter_30);
    return ret;
};

export function __wbindgen_closure_wrapper761(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 108, __wbg_adapter_30);
    return ret;
};

export function __wbindgen_closure_wrapper985(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 236, __wbg_adapter_35);
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

