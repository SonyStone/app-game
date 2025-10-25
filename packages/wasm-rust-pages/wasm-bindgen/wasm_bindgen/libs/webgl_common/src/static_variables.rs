use std::default;

use derive_into::IntoU32;
use web_sys::WebGl2RenderingContext;

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32, Default)]
pub enum WebGlVersion {
    One,
    #[default]
    Two,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32, Default)]
#[repr(u32)]
pub enum DataType {
    /// i8
    Byte = WebGl2RenderingContext::BYTE,
    /// u8
    UnsignedByte = WebGl2RenderingContext::UNSIGNED_BYTE,
    /// i16
    Short = WebGl2RenderingContext::SHORT,
    /// u16
    UnsignedShort = WebGl2RenderingContext::UNSIGNED_SHORT,
    /// i32
    Int = WebGl2RenderingContext::INT,
    /// u32
    UnsignedInt = WebGl2RenderingContext::UNSIGNED_INT,
    #[default]
    /// f32
    Float = WebGl2RenderingContext::FLOAT,
    /// f16
    HalfFloat = WebGl2RenderingContext::HALF_FLOAT,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32)]
#[repr(u32)]
pub enum BufferTarget {
    /// Buffer containing vertex attributes, such as vertex coordinates, texture coordinate data, or vertex color data.
    ArrayBuffer = WebGl2RenderingContext::ARRAY_BUFFER,
    /// Buffer used for element indices.
    ElementArrayBuffer = WebGl2RenderingContext::ELEMENT_ARRAY_BUFFER,
    /// Buffer for copying from one buffer object to another.
    CopyReadBuffer = WebGl2RenderingContext::COPY_READ_BUFFER,
    /// Buffer for copying from one buffer object to another.
    CopyWriteBuffer = WebGl2RenderingContext::COPY_WRITE_BUFFER,
    /// Buffer for transform feedback operations.
    TransformFeedbackBuffer = WebGl2RenderingContext::TRANSFORM_FEEDBACK_BUFFER,
    /// Buffer used for storing uniform blocks.
    UniformBuffer = WebGl2RenderingContext::UNIFORM_BUFFER,
    /// Buffer used for pixel transfer operations.
    PixelPackBuffer = WebGl2RenderingContext::PIXEL_PACK_BUFFER,
    /// Buffer used for pixel transfer operations.
    PixelUnpackBuffer = WebGl2RenderingContext::PIXEL_UNPACK_BUFFER,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32)]
#[repr(u32)]
pub enum BufferUsage {
    StreamDraw = WebGl2RenderingContext::STREAM_DRAW,
    StreamRead = WebGl2RenderingContext::STREAM_READ,
    StreamCopy = WebGl2RenderingContext::STREAM_COPY,
    StaticDraw = WebGl2RenderingContext::STATIC_DRAW,
    StaticRead = WebGl2RenderingContext::STATIC_READ,
    StaticCopy = WebGl2RenderingContext::STATIC_COPY,
    DynamicDraw = WebGl2RenderingContext::DYNAMIC_DRAW,
    DynamicRead = WebGl2RenderingContext::DYNAMIC_READ,
    DynamicCopy = WebGl2RenderingContext::DYNAMIC_COPY,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32)]
#[repr(u32)]
pub enum TextureFormat {
    Red = WebGl2RenderingContext::RED,
    Rg = WebGl2RenderingContext::RG,
    Rgb = WebGl2RenderingContext::RGB,
    Rgba = WebGl2RenderingContext::RGBA,
    RedInteger = WebGl2RenderingContext::RED_INTEGER,
    RgInteger = WebGl2RenderingContext::RG_INTEGER,
    RgbInteger = WebGl2RenderingContext::RGB_INTEGER,
    RgbaInteger = WebGl2RenderingContext::RGBA_INTEGER,
    DepthComponent = WebGl2RenderingContext::DEPTH_COMPONENT,
    DepthStencil = WebGl2RenderingContext::DEPTH_STENCIL,
    Luminance = WebGl2RenderingContext::LUMINANCE,
    LuminanceAlpha = WebGl2RenderingContext::LUMINANCE_ALPHA,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32)]
#[repr(u32)]
pub enum TextureInternalFormat {
    R8 = WebGl2RenderingContext::R8,
    R8Snorm = WebGl2RenderingContext::R8_SNORM,
    R16f = WebGl2RenderingContext::R16F,
    R32f = WebGl2RenderingContext::R32F,
    R8i = WebGl2RenderingContext::R8I,
    R8ui = WebGl2RenderingContext::R8UI,
    R16i = WebGl2RenderingContext::R16I,
    R16ui = WebGl2RenderingContext::R16UI,
    R32i = WebGl2RenderingContext::R32I,
    R32ui = WebGl2RenderingContext::R32UI,
    Rg8 = WebGl2RenderingContext::RG8,
    Rg8Snorm = WebGl2RenderingContext::RG8_SNORM,
    Rg16f = WebGl2RenderingContext::RG16F,
    Rg32f = WebGl2RenderingContext::RG32F,
    Rg8i = WebGl2RenderingContext::RG8I,
    Rg8ui = WebGl2RenderingContext::RG8UI,
    Rg16i = WebGl2RenderingContext::RG16I,
    Rg16ui = WebGl2RenderingContext::RG16UI,
    Rg32i = WebGl2RenderingContext::RG32I,
    Rg32ui = WebGl2RenderingContext::RG32UI,
    Rgb8 = WebGl2RenderingContext::RGB8,
    Srgb8 = WebGl2RenderingContext::SRGB8,
    Rgb565 = WebGl2RenderingContext::RGB565,
    R11fG11fB10f = WebGl2RenderingContext::R11F_G11F_B10F,
    Rgb9e5 = WebGl2RenderingContext::RGB9_E5,
    Rgb16f = WebGl2RenderingContext::RGB16F,
    Rgb32f = WebGl2RenderingContext::RGB32F,
    Rgb8i = WebGl2RenderingContext::RGB8I,
    Rgb8ui = WebGl2RenderingContext::RGB8UI,
    Rgb16i = WebGl2RenderingContext::RGB16I,
    Rgb16ui = WebGl2RenderingContext::RGB16UI,
    Rgb32i = WebGl2RenderingContext::RGB32I,
    Rgb32ui = WebGl2RenderingContext::RGB32UI,
    Rgba8 = WebGl2RenderingContext::RGBA8,
    Srgb8Alpha8 = WebGl2RenderingContext::SRGB8_ALPHA8,
    Rgb5A1 = WebGl2RenderingContext::RGB5_A1,
    Rgba4 = WebGl2RenderingContext::RGBA4,
    Rgba16f = WebGl2RenderingContext::RGBA16F,
    Rgba32f = WebGl2RenderingContext::RGBA32F,
    Rgba8i = WebGl2RenderingContext::RGBA8I,
    Rgba8ui = WebGl2RenderingContext::RGBA8UI,
    Rgba16i = WebGl2RenderingContext::RGBA16I,
    Rgba16ui = WebGl2RenderingContext::RGBA16UI,
    Rgba32i = WebGl2RenderingContext::RGBA32I,
    Rgba32ui = WebGl2RenderingContext::RGBA32UI,
    DepthComponent16 = WebGl2RenderingContext::DEPTH_COMPONENT16,
    DepthComponent24 = WebGl2RenderingContext::DEPTH_COMPONENT24,
    DepthComponent32f = WebGl2RenderingContext::DEPTH_COMPONENT32F,
    Depth24Stencil8 = WebGl2RenderingContext::DEPTH24_STENCIL8,
    Depth32fStencil8 = WebGl2RenderingContext::DEPTH32F_STENCIL8,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32)]
#[repr(u32)]
pub enum TextureWrap {
    Repeat = WebGl2RenderingContext::REPEAT,
    ClampToEdge = WebGl2RenderingContext::CLAMP_TO_EDGE,
    MirroredRepeat = WebGl2RenderingContext::MIRRORED_REPEAT,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32)]
#[repr(u32)]
pub enum TextureFilter {
    Nearest = WebGl2RenderingContext::NEAREST,
    Linear = WebGl2RenderingContext::LINEAR,
    NearestMipmapNearest = WebGl2RenderingContext::NEAREST_MIPMAP_NEAREST,
    LinearMipmapNearest = WebGl2RenderingContext::LINEAR_MIPMAP_NEAREST,
    NearestMipmapLinear = WebGl2RenderingContext::NEAREST_MIPMAP_LINEAR,
    LinearMipmapLinear = WebGl2RenderingContext::LINEAR_MIPMAP_LINEAR,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32)]
#[repr(u32)]
pub enum TextureDataType {
    UnsignedByte = WebGl2RenderingContext::UNSIGNED_BYTE,
    Byte = WebGl2RenderingContext::BYTE,
    Short = WebGl2RenderingContext::SHORT,
    UnsignedShort = WebGl2RenderingContext::UNSIGNED_SHORT,
    Int = WebGl2RenderingContext::INT,
    UnsignedInt = WebGl2RenderingContext::UNSIGNED_INT,
    Float = WebGl2RenderingContext::FLOAT,
    HalfFloat = WebGl2RenderingContext::HALF_FLOAT,
    UnsignedShort4444 = WebGl2RenderingContext::UNSIGNED_SHORT_4_4_4_4,
    UnsignedShort5551 = WebGl2RenderingContext::UNSIGNED_SHORT_5_5_5_1,
    UnsignedShort565 = WebGl2RenderingContext::UNSIGNED_SHORT_5_6_5,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32)]
#[repr(u32)]
pub enum TextureCubeMapFace {
    PositiveX = WebGl2RenderingContext::TEXTURE_CUBE_MAP_POSITIVE_X,
    NegativeX = WebGl2RenderingContext::TEXTURE_CUBE_MAP_NEGATIVE_X,
    PositiveY = WebGl2RenderingContext::TEXTURE_CUBE_MAP_POSITIVE_Y,
    NegativeY = WebGl2RenderingContext::TEXTURE_CUBE_MAP_NEGATIVE_Y,
    PositiveZ = WebGl2RenderingContext::TEXTURE_CUBE_MAP_POSITIVE_Z,
    NegativeZ = WebGl2RenderingContext::TEXTURE_CUBE_MAP_NEGATIVE_Z,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32)]
#[repr(u32)]
pub enum TextureCubeMapTarget {
    TextureCubeMapPositiveX = WebGl2RenderingContext::TEXTURE_CUBE_MAP_POSITIVE_X,
    TextureCubeMapNegativeX = WebGl2RenderingContext::TEXTURE_CUBE_MAP_NEGATIVE_X,
    TextureCubeMapPositiveY = WebGl2RenderingContext::TEXTURE_CUBE_MAP_POSITIVE_Y,
    TextureCubeMapNegativeY = WebGl2RenderingContext::TEXTURE_CUBE_MAP_NEGATIVE_Y,
    TextureCubeMapPositiveZ = WebGl2RenderingContext::TEXTURE_CUBE_MAP_POSITIVE_Z,
    TextureCubeMapNegativeZ = WebGl2RenderingContext::TEXTURE_CUBE_MAP_NEGATIVE_Z,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32)]
#[repr(u32)]
pub enum TextureCubeMapFaceTarget {
    TextureCubeMapPositiveX = WebGl2RenderingContext::TEXTURE_CUBE_MAP_POSITIVE_X,
    TextureCubeMapNegativeX = WebGl2RenderingContext::TEXTURE_CUBE_MAP_NEGATIVE_X,
    TextureCubeMapPositiveY = WebGl2RenderingContext::TEXTURE_CUBE_MAP_POSITIVE_Y,
    TextureCubeMapNegativeY = WebGl2RenderingContext::TEXTURE_CUBE_MAP_NEGATIVE_Y,
    TextureCubeMapPositiveZ = WebGl2RenderingContext::TEXTURE_CUBE_MAP_POSITIVE_Z,
    TextureCubeMapNegativeZ = WebGl2RenderingContext::TEXTURE_CUBE_MAP_NEGATIVE_Z,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32)]
#[repr(u32)]
pub enum TextureCubeMapFaceDirection {
    PositiveX = WebGl2RenderingContext::TEXTURE_CUBE_MAP_POSITIVE_X,
    NegativeX = WebGl2RenderingContext::TEXTURE_CUBE_MAP_NEGATIVE_X,
    PositiveY = WebGl2RenderingContext::TEXTURE_CUBE_MAP_POSITIVE_Y,
    NegativeY = WebGl2RenderingContext::TEXTURE_CUBE_MAP_NEGATIVE_Y,
    PositiveZ = WebGl2RenderingContext::TEXTURE_CUBE_MAP_POSITIVE_Z,
    NegativeZ = WebGl2RenderingContext::TEXTURE_CUBE_MAP_NEGATIVE_Z,
}

/// WebGLRenderingContext: create_shader()
#[derive(Eq, Hash, PartialEq, Clone, Copy, Debug, IntoU32)]
#[repr(u32)]
pub enum ShaderType {
    /// vertex shader    
    VertexShader = WebGl2RenderingContext::VERTEX_SHADER,

    /// fragment shader
    FragmentShader = WebGl2RenderingContext::FRAGMENT_SHADER,
}

/// WebGLRenderingContext: enable()
#[derive(Eq, Hash, PartialEq, Clone, Copy, Debug, IntoU32, Default)]
#[repr(u32)]
pub enum Capability {
    Blend = WebGl2RenderingContext::BLEND,
    CullFace = WebGl2RenderingContext::CULL_FACE,
    #[default]
    DepthTest = WebGl2RenderingContext::DEPTH_TEST,
    Dither = WebGl2RenderingContext::DITHER,
    PolygonOffsetFill = WebGl2RenderingContext::POLYGON_OFFSET_FILL,
    SampleAlphaToCoverage = WebGl2RenderingContext::SAMPLE_ALPHA_TO_COVERAGE,
    SampleCoverage = WebGl2RenderingContext::SAMPLE_COVERAGE,
    ScissorTest = WebGl2RenderingContext::SCISSOR_TEST,
    StencilTest = WebGl2RenderingContext::STENCIL_TEST,
}

/// WebGLRenderingContext: blendFunc() blendFuncSeparate()
/// [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendFuncSeparate)
#[derive(Eq, Hash, PartialEq, Clone, Copy, Debug, IntoU32, Default)]
#[repr(u32)]
pub enum BlendFactor {
    Zero = WebGl2RenderingContext::ZERO,
    #[default]
    One = WebGl2RenderingContext::ONE,
    SrcColor = WebGl2RenderingContext::SRC_COLOR,
    OneMinusSrcColor = WebGl2RenderingContext::ONE_MINUS_SRC_COLOR,
    DstColor = WebGl2RenderingContext::DST_COLOR,
    OneMinusDstColor = WebGl2RenderingContext::ONE_MINUS_DST_COLOR,
    SrcAlpha = WebGl2RenderingContext::SRC_ALPHA,
    OneMinusSrcAlpha = WebGl2RenderingContext::ONE_MINUS_SRC_ALPHA,
    DstAlpha = WebGl2RenderingContext::DST_ALPHA,
    OneMinusDstAlpha = WebGl2RenderingContext::ONE_MINUS_DST_ALPHA,
    ConstantColor = WebGl2RenderingContext::CONSTANT_COLOR,
    OneMinusConstantColor = WebGl2RenderingContext::ONE_MINUS_CONSTANT_COLOR,
    ConstantAlpha = WebGl2RenderingContext::CONSTANT_ALPHA,
    OneMinusConstantAlpha = WebGl2RenderingContext::ONE_MINUS_CONSTANT_ALPHA,
    SrcAlphaSaturate = WebGl2RenderingContext::SRC_ALPHA_SATURATE,
}

/// WebGLRenderingContext: blendEquation() blendEquationSeparate()
#[derive(Eq, Hash, PartialEq, Clone, Copy, Debug, IntoU32, Default)]
#[repr(u32)]
pub enum BlendEquation {
    #[default]
    FuncAdd = WebGl2RenderingContext::FUNC_ADD,
    FuncSubtract = WebGl2RenderingContext::FUNC_SUBTRACT,
    FuncReverseSubtract = WebGl2RenderingContext::FUNC_REVERSE_SUBTRACT,
    Min = WebGl2RenderingContext::MIN,
    Max = WebGl2RenderingContext::MAX,
}

#[derive(Eq, Hash, PartialEq, Clone, Copy, Debug, IntoU32, Default)]
#[repr(u32)]
pub enum CullFaceMode {
    Front = WebGl2RenderingContext::FRONT,
    #[default]
    Back = WebGl2RenderingContext::BACK,
    FrontAndBack = WebGl2RenderingContext::FRONT_AND_BACK,
}

#[derive(Eq, Hash, PartialEq, Clone, Copy, Debug, IntoU32, Default)]
#[repr(u32)]
pub enum FrontFaceDirection {
    Cw = WebGl2RenderingContext::CW,
    #[default]
    Ccw = WebGl2RenderingContext::CCW,
}

#[derive(Eq, Hash, PartialEq, Clone, Copy, Debug, IntoU32, Default)]
#[repr(u32)]
pub enum DepthFunction {
    Never = WebGl2RenderingContext::NEVER,
    #[default]
    Less = WebGl2RenderingContext::LESS,
    Equal = WebGl2RenderingContext::EQUAL,
    Lequal = WebGl2RenderingContext::LEQUAL,
    Greater = WebGl2RenderingContext::GREATER,
    Notequal = WebGl2RenderingContext::NOTEQUAL,
    Gequal = WebGl2RenderingContext::GEQUAL,
    Always = WebGl2RenderingContext::ALWAYS,
}

#[derive(Eq, Hash, PartialEq, Clone, Copy, Debug, IntoU32, Default)]
#[repr(u32)]
pub enum StencilOp {
    #[default]
    Keep = WebGl2RenderingContext::KEEP,
    Zero = WebGl2RenderingContext::ZERO,
    Replace = WebGl2RenderingContext::REPLACE,
    Incr = WebGl2RenderingContext::INCR,
    IncrWrap = WebGl2RenderingContext::INCR_WRAP,
    Decr = WebGl2RenderingContext::DECR,
    DecrWrap = WebGl2RenderingContext::DECR_WRAP,
    Invert = WebGl2RenderingContext::INVERT,
}

/// TextureUnit
/// ```rust
/// gl.active_texture(gl.TEXTURE1);
/// ```
#[derive(Eq, Hash, PartialEq, Clone, Copy, Debug, IntoU32, Default)]
#[repr(u32)]
pub enum TextureUnit {
    #[default]
    Texture0 = WebGl2RenderingContext::TEXTURE0,
    Texture1 = WebGl2RenderingContext::TEXTURE1,
    Texture2 = WebGl2RenderingContext::TEXTURE2,
    Texture3 = WebGl2RenderingContext::TEXTURE3,
    Texture4 = WebGl2RenderingContext::TEXTURE4,
    Texture5 = WebGl2RenderingContext::TEXTURE5,
    Texture6 = WebGl2RenderingContext::TEXTURE6,
    Texture7 = WebGl2RenderingContext::TEXTURE7,
    Texture8 = WebGl2RenderingContext::TEXTURE8,
    Texture9 = WebGl2RenderingContext::TEXTURE9,
    Texture10 = WebGl2RenderingContext::TEXTURE10,
    Texture11 = WebGl2RenderingContext::TEXTURE11,
    Texture12 = WebGl2RenderingContext::TEXTURE12,
    Texture13 = WebGl2RenderingContext::TEXTURE13,
    Texture14 = WebGl2RenderingContext::TEXTURE14,
    Texture15 = WebGl2RenderingContext::TEXTURE15,
    Texture16 = WebGl2RenderingContext::TEXTURE16,
    Texture17 = WebGl2RenderingContext::TEXTURE17,
    Texture18 = WebGl2RenderingContext::TEXTURE18,
    Texture19 = WebGl2RenderingContext::TEXTURE19,
    Texture20 = WebGl2RenderingContext::TEXTURE20,
    Texture21 = WebGl2RenderingContext::TEXTURE21,
    Texture22 = WebGl2RenderingContext::TEXTURE22,
    Texture23 = WebGl2RenderingContext::TEXTURE23,
    Texture24 = WebGl2RenderingContext::TEXTURE24,
    Texture25 = WebGl2RenderingContext::TEXTURE25,
    Texture26 = WebGl2RenderingContext::TEXTURE26,
    Texture27 = WebGl2RenderingContext::TEXTURE27,
    Texture28 = WebGl2RenderingContext::TEXTURE28,
    Texture29 = WebGl2RenderingContext::TEXTURE29,
    Texture30 = WebGl2RenderingContext::TEXTURE30,
    Texture31 = WebGl2RenderingContext::TEXTURE31,
    ActiveTexture = WebGl2RenderingContext::ACTIVE_TEXTURE,
}

// Framebuffer Object
#[derive(Eq, Hash, PartialEq, Clone, Copy, Debug, IntoU32)]
#[repr(u32)]
pub enum FramebufferTarget {
    Framebuffer = WebGl2RenderingContext::FRAMEBUFFER,
    Renderbuffer = WebGl2RenderingContext::RENDERBUFFER,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, IntoU32, Default)]
#[repr(u32)]
pub enum TextureTarget {
    #[default]
    Texture2D = WebGl2RenderingContext::TEXTURE_2D,
    TextureCubeMap = WebGl2RenderingContext::TEXTURE_CUBE_MAP,
    Texture3D = WebGl2RenderingContext::TEXTURE_3D,
    Texture2DArray = WebGl2RenderingContext::TEXTURE_2D_ARRAY,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, Default)]
#[repr(u32)]
pub enum HintMode {
    #[default]
    DontCare = WebGl2RenderingContext::DONT_CARE,
    Fastest = WebGl2RenderingContext::FASTEST,
    Nicest = WebGl2RenderingContext::NICEST,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32)]
#[repr(u32)]
pub enum Mask {
    DepthBufferBit = WebGl2RenderingContext::DEPTH_BUFFER_BIT,
    StencilBufferBit = WebGl2RenderingContext::STENCIL_BUFFER_BIT,
    ColorBufferBit = WebGl2RenderingContext::COLOR_BUFFER_BIT,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32)]
#[repr(u32)]
pub enum DrawMode {
    /// Draws a single dot.
    Points = WebGl2RenderingContext::POINTS,
    /// Draws a straight line to the next vertex.
    LineStrip = WebGl2RenderingContext::LINE_STRIP,
    /// Draws a straight line to the next vertex, and connects the last vertex back to the first.
    LineLoop = WebGl2RenderingContext::LINE_LOOP,
    /// Draws a line between a pair of vertices.
    Lines = WebGl2RenderingContext::LINES,
    TriangleStrip = WebGl2RenderingContext::TRIANGLE_STRIP,
    TriangleFan = WebGl2RenderingContext::TRIANGLE_FAN,
    /// Draws a triangle for a group of three vertices.
    Triangles = WebGl2RenderingContext::TRIANGLES,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, IntoU32)]
#[repr(u32)]
pub enum ErrorType {
    NoError = WebGl2RenderingContext::NO_ERROR,
    InvalidEnum = WebGl2RenderingContext::INVALID_ENUM,
    InvalidValue = WebGl2RenderingContext::INVALID_VALUE,
    InvalidOperation = WebGl2RenderingContext::INVALID_OPERATION,
    InvalidFramebufferOperation = WebGl2RenderingContext::INVALID_FRAMEBUFFER_OPERATION,
    OutOfMemory = WebGl2RenderingContext::OUT_OF_MEMORY,
    ContextLostWebgl = WebGl2RenderingContext::CONTEXT_LOST_WEBGL,
}

pub fn get_error(error: u32) -> ErrorType {
    match error {
        WebGl2RenderingContext::NO_ERROR => ErrorType::NoError,
        WebGl2RenderingContext::INVALID_ENUM => ErrorType::InvalidEnum,
        WebGl2RenderingContext::INVALID_VALUE => ErrorType::InvalidValue,
        WebGl2RenderingContext::INVALID_OPERATION => ErrorType::InvalidOperation,
        WebGl2RenderingContext::INVALID_FRAMEBUFFER_OPERATION => {
            ErrorType::InvalidFramebufferOperation
        }
        WebGl2RenderingContext::OUT_OF_MEMORY => ErrorType::OutOfMemory,
        WebGl2RenderingContext::CONTEXT_LOST_WEBGL => ErrorType::ContextLostWebgl,
        _ => ErrorType::NoError,
    }
}
