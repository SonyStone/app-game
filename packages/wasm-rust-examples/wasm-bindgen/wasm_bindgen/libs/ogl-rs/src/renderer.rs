use std::collections::HashMap;

use wasm_bindgen::JsCast;

use crate::{program::Program, BlendEquationState, BlendFuncState};

use webgl_common::static_variables::{
    BlendEquation, BlendFactor, Capability, CullFaceMode, DepthFunction, FramebufferTarget,
    FrontFaceDirection, TextureUnit,
};

#[derive(Debug, Clone, PartialEq, Eq)]
struct Viewport {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RenderState {
    blend_func: BlendFuncState,
    blend_equation: BlendEquationState,
    viewport: Viewport,
    capabilities: HashMap<Capability, bool>,
    cull_face: Option<CullFaceMode>,
    front_face: Option<FrontFaceDirection>,
    depth_mask: Option<bool>,
    depth_func: Option<DepthFunction>,
    active_texture_unit: Option<TextureUnit>,
    framebuffer: Option<web_sys::WebGlFramebuffer>,
}

/// The WebGL2 renderer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Renderer<'a> {
    gl: &'a web_sys::WebGl2RenderingContext,

    dpr: u32,
    alpha: bool,
    color: bool,
    depth: bool,
    stencil: bool,
    premultiplied_alpha: bool,
    auto_clear: bool,

    state: RenderState,

    width: i32,
    height: i32,
}

impl<'a> Renderer<'a> {
    pub fn new(gl: &'a web_sys::WebGl2RenderingContext) -> Self {
        Self {
            dpr: 1,
            alpha: false,
            color: true,
            depth: true,
            stencil: false,
            premultiplied_alpha: false,
            auto_clear: true,
            // antialias: false,
            gl,
            state: RenderState {
                blend_func: BlendFuncState {
                    src: BlendFactor::One,
                    dst: BlendFactor::Zero,
                    src_alpha: None,
                    dst_alpha: None,
                },
                blend_equation: BlendEquationState {
                    mode_rgb: BlendEquation::FuncAdd,
                    mode_alpha: None,
                },
                viewport: Viewport {
                    x: 0,
                    y: 0,
                    width: 300,
                    height: 150,
                },
                capabilities: HashMap::new(),
                cull_face: None,
                front_face: None,
                depth_mask: None,
                depth_func: None,
                active_texture_unit: None,
                framebuffer: None,
            },
            // preserve_drawing_buffer = false,
            width: 300,
            height: 150,
        }
    }

    pub fn set_size(&mut self, width: i32, height: i32) {
        self.width = width;
        self.height = height;

        let canvas: web_sys::HtmlCanvasElement = self.gl.canvas().unwrap().dyn_into().unwrap();

        canvas.set_width(width as u32);
        canvas.set_height(height as u32);

        let canvas: &web_sys::HtmlElement = canvas.as_ref();

        let style = canvas.style();
        style
            .set_property("width", &format!("{}px", width))
            .unwrap();
        style
            .set_property("height", &format!("{}px", height))
            .unwrap();
    }

    pub fn set_viewport(&mut self, x: i32, y: i32, width: i32, height: i32) {
        if self.state.viewport.width == width && self.state.viewport.height == height {
            return;
        }
        self.state.viewport.width = width;
        self.state.viewport.height = height;
        self.state.viewport.x = x;
        self.state.viewport.y = y;
        self.gl.viewport(x, y, width, height);
    }

    /// [scissor](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/scissor)
    pub fn set_scissor(&mut self, x: i32, y: i32, width: i32, height: i32) {
        self.gl.scissor(x, y, width, height);
    }

    /// [enable](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/enable)
    pub fn enable(&mut self, capability: Capability) {
        if let Some(&true) = self.state.capabilities.get(&capability) {
            return;
        }
        self.gl.enable(capability as u32);
        self.state.capabilities.insert(capability, true);
    }

    pub fn disable(&mut self, capability: Capability) {
        if let Some(&false) = self.state.capabilities.get(&capability) {
            return;
        }
        self.gl.disable(capability as u32);
        self.state.capabilities.insert(capability, false);
    }

    pub fn set_blend_func(&mut self, blend_func: BlendFuncState) {
        if self.state.blend_func == blend_func {
            return;
        }

        let (src, dst) = (blend_func.src, blend_func.dst);
        if let (Some(src_alpha), Some(dst_alpha)) = (blend_func.src_alpha, blend_func.dst_alpha) {
            self.state.blend_func = blend_func;
            self.gl
                .blend_func_separate(src as u32, dst as u32, src_alpha as u32, dst_alpha as u32);
        } else {
            self.state.blend_func = blend_func;
            self.gl.blend_func(src as u32, dst as u32);
        }
    }

    pub fn set_blend_equation(
        &mut self,
        mode_rgb: BlendEquation,
        mode_alpha: Option<BlendEquation>,
    ) {
        if self.state.blend_equation.mode_rgb == mode_rgb
            && self.state.blend_equation.mode_alpha == mode_alpha
        {
            return;
        }
        self.state.blend_equation.mode_rgb = mode_rgb;
        self.state.blend_equation.mode_alpha = mode_alpha;
        if let Some(mode_alpha) = mode_alpha {
            self.gl
                .blend_equation_separate(mode_rgb as u32, mode_alpha as u32);
        } else {
            self.gl.blend_equation(mode_rgb as u32);
        }
    }

    pub fn set_cull_face(&mut self, value: CullFaceMode) {
        if self.state.cull_face == Some(value) {
            return;
        }
        self.state.cull_face = Some(value);
        self.gl.cull_face(value as u32);
    }

    pub fn set_front_face(&mut self, value: FrontFaceDirection) {
        if self.state.front_face == Some(value) {
            return;
        }
        self.state.front_face = Some(value);
        self.gl.front_face(value as u32);
    }

    pub fn set_depth_mask(&mut self, value: bool) {
        if self.state.depth_mask == Some(value) {
            return;
        }
        self.state.depth_mask = Some(value);
        self.gl.depth_mask(value);
    }

    pub fn set_depth_func(&mut self, value: DepthFunction) {
        if self.state.depth_func == Some(value) {
            return;
        }
        self.state.depth_func = Some(value);
        self.gl.depth_func(value as u32);
    }

    pub fn active_texture(&mut self, texture_unit: TextureUnit) {
        if self.state.active_texture_unit == Some(texture_unit) {
            return;
        }
        self.state.active_texture_unit = Some(texture_unit);
        self.gl.active_texture(texture_unit as u32);
    }

    pub fn bind_framebuffer(
        &mut self,
        target: FramebufferTarget,
        buffer: Option<&web_sys::WebGlFramebuffer>,
    ) {
        if self.state.framebuffer.as_ref() == buffer {
            return;
        }
        self.state.framebuffer = buffer.cloned();
        self.gl.bind_framebuffer(target as u32, buffer);
    }

    pub fn get_render_list(&mut self) {
        todo!()
    }

    pub fn clear_color(&mut self) {
        todo!()
    }

    pub fn render(&mut self) {
        todo!()
    }

    pub fn sort_ui(&mut self) {
        todo!()
    }

    pub fn sort_transparent(&mut self) {
        todo!()
    }

    pub fn sort_opaque(&mut self) {
        todo!()
    }

    pub fn apply_state(&mut self, program: &Program) {
        if program.depth_test {
            self.enable(Capability::DepthTest);
        } else {
            self.disable(Capability::DepthTest);
        }

        if let Some(cull_face) = program.cull_face {
            self.enable(Capability::CullFace);
            self.set_cull_face(cull_face);
        } else {
            self.disable(Capability::CullFace);
        }

        if let Some(blend_func) = program.blend_func {
            self.enable(Capability::Blend);
            self.set_blend_func(blend_func);
        } else {
            self.disable(Capability::Blend);
        }

        self.set_front_face(program.front_face);
        self.set_depth_mask(program.depth_write);
        self.set_depth_func(program.depth_func);

        if let Some(blend_equation) = program.blend_equation {
            self.set_blend_equation(blend_equation.mode_rgb, blend_equation.mode_alpha);
        }
    }

    pub fn use_program(&mut self, program: &Program) {
        // TODO check if program is already in use

        self.gl.use_program(Some(&program.program));

        // TODO set uniform buffer objects (we will not use regular uniforms)

        self.apply_state(program);
    }
}
