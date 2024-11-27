use std::collections::HashMap;

use crate::{
    buffer::Buffer, framebuffer::Framebuffer, shader_program::ShaderProgram, texture::Texture,
    vertex_array_object::VertexArrayObject,
};

use webgl_common::{
    BlendEquation, BlendFactor, Color, CullFaceMode, DepthFunction, FrontFaceDirection, HintMode,
    StencilOp, TextureTarget, TextureUnit, Viewport,
};

///
/// # The WebGL2 renderer state.
/// This struct is used to keep track of the current state of the WebGL2 renderer.
///
#[derive(Debug, Clone)]
pub struct RendererState {
    // 1. Shader Program State
    pub program: Option<ShaderProgram>,

    // 2. Buffer Bindings
    pub array_buffer: Option<Buffer>,
    pub element_array_buffer: Option<Buffer>,
    pub uniform_buffers: HashMap<u32, Option<Buffer>>,

    // 3. Vertex Array Objects
    pub vertex_array_object: Option<VertexArrayObject>,

    // 4. Texture Units and Bindings
    pub active_texture_unit: TextureUnit,
    pub texture_units: HashMap<u32, (Texture, TextureTarget)>, // (Texture, Target)

    // 5. Framebuffer Bindings
    pub draw_framebuffer: Option<Framebuffer>,
    pub read_framebuffer: Option<Framebuffer>,

    // 7. Render Enabled Capabilities
    // webgl2 have 10 capabilities
    pub blend: Option<BlendState>,
    pub cull_face: Option<FaceCullingState>,
    pub depth_test: Option<DepthTestState>,
    pub dither: Option<DitherState>,
    pub polygon_offset_fill: Option<PolygonOffsetState>,
    // TODO SAMPLE_ALPHA_TO_COVERAGE
    pub sample_coverage: Option<SampleCoverageState>,
    pub scissor_test: Option<ScissorTestState>,
    pub stencil_test: Option<StencilTestState>,
    pub rasterizer_discard: Option<RasterizerDiscard>,

    // 8. Viewport and Scissor State
    pub viewport: Viewport,

    // 9. Color Mask
    pub color_mask: [bool; 4],

    // 10. Clear Values
    pub clear_color: Color,
    pub clear_depth: f32,
    pub clear_stencil: i32,

    // 11. Line Width
    pub line_width: f32,
    pub depth_range: (f32, f32),

    // 15. Hint States
    pub fragment_shader_derivative_hint: HintMode,

    // 16. Pixel Store Parameters
    pub unpack_alignment: i32,
    pub pack_alignment: i32,
}

impl Default for RendererState {
    fn default() -> Self {
        Self {
            program: None,

            array_buffer: None,
            element_array_buffer: None,
            uniform_buffers: HashMap::new(),

            vertex_array_object: None,

            active_texture_unit: TextureUnit::default(),
            texture_units: HashMap::new(),

            draw_framebuffer: None,
            read_framebuffer: None,

            blend: None,
            cull_face: None,
            depth_test: None,
            dither: None,
            polygon_offset_fill: None,
            sample_coverage: None,
            scissor_test: None,
            stencil_test: None,
            rasterizer_discard: None,

            viewport: Viewport::default(),

            color_mask: [true, true, true, true],

            clear_color: Color::default(),
            clear_depth: 1.0,
            clear_stencil: 0,

            line_width: 1.0,
            depth_range: (0.0, 1.0),

            fragment_shader_derivative_hint: HintMode::default(),

            unpack_alignment: 4,
            pack_alignment: 4,
        }
    }
}

impl RendererState {
    pub fn new() -> Self {
        Self::default()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct BlendState {
    func: (BlendFactor, BlendFactor),
    equation: BlendEquation,
    color: [f32; 4],
}

impl Default for BlendState {
    fn default() -> Self {
        Self {
            func: (BlendFactor::One, BlendFactor::Zero),
            equation: BlendEquation::FuncAdd,
            color: [0.0, 0.0, 0.0, 0.0],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DepthTestState {
    func: DepthFunction,
    mask: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StencilTestState {
    func: (DepthFunction, i32, u32),
    op: (StencilOp, StencilOp, StencilOp),
    mask: u32,
}

impl Default for StencilTestState {
    fn default() -> Self {
        Self {
            func: (DepthFunction::Always, 0, 0xFF),
            op: (StencilOp::Keep, StencilOp::Keep, StencilOp::Keep),
            mask: 0xFF,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct FaceCullingState {
    mode: CullFaceMode,
    front_face: FrontFaceDirection,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PolygonOffsetState {
    factor: f32,
    units: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SampleCoverageState {
    value: f32,
    invert: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScissorTestState {
    box_: [i32; 4],
}

impl Default for ScissorTestState {
    fn default() -> Self {
        Self {
            box_: [0, 0, 300, 150],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DitherState {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RasterizerDiscard {}
