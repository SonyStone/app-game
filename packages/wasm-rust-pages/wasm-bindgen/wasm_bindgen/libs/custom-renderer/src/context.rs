use slotmap::{new_key_type, SlotMap};
use std::{cell::RefCell, rc::Rc};
use web_sys::{
    WebGl2RenderingContext, WebGlBuffer, WebGlFramebuffer, WebGlProgram, WebGlQuery,
    WebGlRenderbuffer, WebGlSampler, WebGlShader, WebGlSync, WebGlTexture, WebGlTransformFeedback,
    WebGlVertexArrayObject,
};
use webgl_common::{BufferTarget, Capability, ScissorBox, ShaderType, Viewport};

#[derive(Debug)]
pub struct Context {
    gl: WebGl2RenderingContext,
    // pub(super) vao: crate::context::VertexArray,
    // A cache of programs to avoid recompiling a [Program] every frame.
    // pub programs: Rc<HashMap<Vec<u8>, Program>>,
    shaders: TrackedResource<WebShaderKey, WebGlShader>,
    programs: TrackedResource<WebProgramKey, WebGlProgram>,
    buffers: TrackedResource<WebBufferKey, WebGlBuffer>,
    vertex_arrays: TrackedResource<WebVertexArrayKey, WebGlVertexArrayObject>,
    textures: TrackedResource<WebTextureKey, WebGlTexture>,
    samplers: TrackedResource<WebSamplerKey, WebGlSampler>,
    fences: TrackedResource<WebFenceKey, WebGlSync>,
    framebuffers: TrackedResource<WebFramebufferKey, WebGlFramebuffer>,
    renderbuffers: TrackedResource<WebRenderbufferKey, WebGlRenderbuffer>,
    queries: TrackedResource<WebQueryKey, WebGlQuery>,
    transform_feedbacks: TrackedResource<WebTransformFeedbackKey, WebGlTransformFeedback>,
}

impl Context {
    pub fn new(context: WebGl2RenderingContext) -> Result<Self, String> {
        context.pixel_storei(WebGl2RenderingContext::UNPACK_ALIGNMENT, 1);
        context.pixel_storei(WebGl2RenderingContext::PACK_ALIGNMENT, 1);

        // let vao = context
        //     .create_vertex_array()
        //     .ok_or("failed creating vertex array")?;

        Ok(Self {
            gl: context,
            // vao: crate::context::VertexArray::new(&context),
            // programs: Rc::new(HashMap::new()),
            shaders: tracked_resource(),
            programs: tracked_resource(),
            buffers: tracked_resource(),
            vertex_arrays: tracked_resource(),
            textures: tracked_resource(),
            samplers: tracked_resource(),
            fences: tracked_resource(),
            framebuffers: tracked_resource(),
            renderbuffers: tracked_resource(),
            queries: tracked_resource(),
            transform_feedbacks: tracked_resource(),
        })
    }

    pub fn gl(&self) -> &WebGl2RenderingContext {
        &self.gl
    }

    pub fn set_scissor(&self, scissor_box: ScissorBox) {
        if scissor_box.width > 0 && scissor_box.height > 0 {
            self.enable(Capability::ScissorTest);
            self.scissor(
                scissor_box.x,
                scissor_box.y,
                scissor_box.width as i32,
                scissor_box.height as i32,
            );
        } else {
            self.disable(Capability::ScissorTest);
        }
    }

    fn set_viewport(&self, viewport: Viewport) {
        self.viewport(
            viewport.x,
            viewport.y,
            viewport.width as i32,
            viewport.height as i32,
        );
    }
}

impl Context {
    pub fn scissor(&self, x: i32, y: i32, width: i32, height: i32) {
        self.gl.scissor(x, y, width, height);
    }

    pub fn create_framebuffer(&self) -> Result<WebFramebufferKey, String> {
        let raw_framebuffer = self.gl.create_framebuffer();

        match raw_framebuffer {
            Some(framebuffer) => {
                let key = self.framebuffers.borrow_mut().insert(framebuffer);
                Ok(key)
            }
            None => Err("Unable to create framebuffer object".to_string()),
        }
    }

    pub fn create_shader(&self, shader_type: ShaderType) -> Result<WebShaderKey, String> {
        let raw_shader = self.gl.create_shader(shader_type.into());

        match raw_shader {
            Some(s) => {
                let key = self.shaders.borrow_mut().insert(s);
                Ok(key)
            }
            None => Err(String::from("Unable to create shader object")),
        }
    }

    pub fn delete_shader(&self, shader: WebShaderKey) {
        let mut shaders = self.shaders.borrow_mut();
        if let Some(ref s) = shaders.remove(shader) {
            self.gl.delete_shader(Some(s))
        }
    }

    pub fn shader_source(&self, shader: WebShaderKey, source: &str) {
        let shaders = self.shaders.borrow();
        let raw_shader = unsafe { shaders.get_unchecked(shader) };
        self.gl.shader_source(raw_shader, source);
    }

    pub fn compile_shader(&self, shader: WebShaderKey) {
        let shaders = self.shaders.borrow();
        let raw_shader = unsafe { shaders.get_unchecked(shader) };
        self.gl.compile_shader(raw_shader);
    }

    pub fn create_program(&self) -> Result<WebProgramKey, String> {
        let raw_program = self.gl.create_program();

        match raw_program {
            Some(p) => {
                let key = self.programs.borrow_mut().insert(p);
                Ok(key)
            }
            None => Err(String::from("Unable to create program object")),
        }
    }

    pub fn delete_program(&self, program: WebProgramKey) {
        let mut programs = self.programs.borrow_mut();
        if let Some(ref p) = programs.remove(program) {
            self.gl.delete_program(Some(p));
        }
    }

    pub fn attach_shader(&self, program: WebProgramKey, shader: WebShaderKey) {
        let programs = self.programs.borrow();
        let shaders = self.shaders.borrow();
        let raw_program = unsafe { programs.get_unchecked(program) };
        let raw_shader = unsafe { shaders.get_unchecked(shader) };
        self.gl.attach_shader(raw_program, raw_shader);
    }

    pub fn link_program(&self, program: WebProgramKey) {
        let programs = self.programs.borrow();
        let raw_program = unsafe { programs.get_unchecked(program) };
        self.gl.link_program(raw_program);
    }

    pub fn get_program_parameter(&self, program: WebProgramKey, pname: u32) -> i32 {
        let programs = self.programs.borrow();
        let raw_program = unsafe { programs.get_unchecked(program) };
        self.gl
            .get_program_parameter(raw_program, pname)
            .as_f64()
            .map(|v| v as i32)
            .unwrap_or(0)
    }

    pub fn get_program_info_log(&self, program: WebProgramKey) -> String {
        let programs = self.programs.borrow();
        let raw_program = unsafe { programs.get_unchecked(program) };
        self.gl
            .get_program_info_log(raw_program)
            .unwrap_or_default()
    }

    pub fn get_active_uniforms(&self, program: WebProgramKey) -> u32 {
        let programs = self.programs.borrow();
        let raw_program = unsafe { programs.get_unchecked(program) };
        self.gl
            .get_program_parameter(raw_program, WebGl2RenderingContext::ACTIVE_UNIFORMS)
            .as_f64()
            .map(|v| v as u32)
            .unwrap_or(0)
    }

    pub fn get_active_uniform(&self, program: WebProgramKey, index: u32) -> Option<ActiveUniform> {
        let programs = self.programs.borrow();
        let raw_program = unsafe { programs.get_unchecked(program) };
        self.gl
            .get_active_uniform(raw_program, index)
            .map(|au| ActiveUniform {
                size: au.size(),
                utype: au.type_(),
                name: au.name(),
            })
    }

    pub fn use_program(&self, program: WebProgramKey) {
        let programs = self.programs.borrow();
        let raw_program = unsafe { programs.get_unchecked(program) };
        self.gl.use_program(Some(raw_program));
    }

    pub fn create_buffer(&self) -> Result<WebBufferKey, String> {
        let raw_buffer = self.gl.create_buffer();

        match raw_buffer {
            Some(b) => {
                let key = self.buffers.borrow_mut().insert(b);
                Ok(key)
            }
            None => Err("Unable to create buffer object".to_string()),
        }
    }

    pub fn bind_buffer(&self, target: BufferTarget, buffer: WebBufferKey) {
        let buffers = self.buffers.borrow();
        let raw_buffer = unsafe { buffers.get_unchecked(buffer) };
        self.gl.bind_buffer(target.into(), Some(raw_buffer));
    }

    pub fn bind_base_base(&self, target: BufferTarget, index: u32, buffer: WebBufferKey) {
        let buffers = self.buffers.borrow();
        let raw_buffer = unsafe { buffers.get_unchecked(buffer) };
        self.gl
            .bind_buffer_base(target.into(), index, Some(raw_buffer));
    }

    pub fn create_vertex_array(&self) -> Result<WebVertexArrayKey, String> {
        let raw_vertex_array = self.gl.create_vertex_array();

        match raw_vertex_array {
            Some(v) => {
                let key = self.vertex_arrays.borrow_mut().insert(v);
                Ok(key)
            }
            None => Err("Unable to create vertex array object".to_string()),
        }
    }

    pub fn delete_vertex_array(&self, vertex_array: WebVertexArrayKey) {
        let mut vertex_arrays = self.vertex_arrays.borrow_mut();
        if let Some(ref v) = vertex_arrays.remove(vertex_array) {
            self.gl.delete_vertex_array(Some(v));
        }
    }

    pub fn bind_vertex_array(&self, vertex_array: WebVertexArrayKey) {
        let vertex_arrays = self.vertex_arrays.borrow();
        let raw_vertex_array = unsafe { vertex_arrays.get_unchecked(vertex_array) };
        self.gl.bind_vertex_array(Some(raw_vertex_array));
    }

    pub fn clear_color(&self, r: f32, g: f32, b: f32, a: f32) {
        self.gl.clear_color(r, g, b, a);
    }

    fn enable(&self, parameter: Capability) {
        self.gl.enable(parameter.into());
    }

    fn disable(&self, parameter: Capability) {
        self.gl.disable(parameter.into());
    }

    fn viewport(&self, x: i32, y: i32, width: i32, height: i32) {
        self.gl.viewport(x, y, width, height);
    }
}

type TrackedResource<K, V> = RefCell<SlotMap<K, V>>;

fn tracked_resource<K: slotmap::Key, V>() -> TrackedResource<K, V> {
    RefCell::new(SlotMap::with_key())
}

new_key_type! { pub struct WebShaderKey; }
new_key_type! { pub struct WebProgramKey; }
new_key_type! { pub struct WebBufferKey; }
new_key_type! { pub struct WebVertexArrayKey; }
new_key_type! { pub struct WebTextureKey; }
new_key_type! { pub struct WebSamplerKey; }
new_key_type! { pub struct WebFenceKey; }
new_key_type! { pub struct WebFramebufferKey; }
new_key_type! { pub struct WebRenderbufferKey; }
new_key_type! { pub struct WebQueryKey; }
new_key_type! { pub struct WebTransformFeedbackKey; }

pub struct ActiveUniform {
    pub size: i32,
    pub utype: u32,
    pub name: String,
}
