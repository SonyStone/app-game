use crate::{
    buffer::Buffer, renderer_state::RendererState, shader_program::ShaderProgram,
    vertex_array_object::VertexArrayObject,
};
use web_sys::{console, WebGl2RenderingContext};
use webgl_common::{
    get_error, slice_as_u8_slice, BufferTarget, BufferUsage, Color, DataType, DrawMode, ErrorType,
    Mask, Viewport,
};

/// The WebGL2 renderer.
#[derive(Debug, Clone)]
pub struct Renderer {
    pub gl: web_sys::WebGl2RenderingContext,
    pub state: RendererState,
}

impl Renderer {
    pub fn new(gl: WebGl2RenderingContext) -> Self {
        Self {
            gl,
            state: RendererState::default(),
        }
    }

    pub fn set_state(&mut self, state: RendererState) {
        console::log_1(&"use_program".into());
        self.use_program(&state.program);

        self.bind_buffer(BufferTarget::ArrayBuffer, &state.array_buffer);

        self.bind_buffer(
            BufferTarget::ElementArrayBuffer,
            &state.element_array_buffer,
        );

        for (index, buffer) in state.uniform_buffers.iter() {
            self.bind_buffer_base(BufferTarget::UniformBuffer, *index, buffer);
        }

        self.bind_vertex_array(&state.vertex_array_object);

        self.gl.active_texture(state.active_texture_unit.into());

        // TODO textires
        // if self.state.texture_units != state.texture_units {
        //     for (index, (texture, target)) in state.texture_units.iter() {
        //         self.gl.active_texture(*index);
        //         self.gl.bind_texture((*target).into(), (*texture).into());
        //     }
        // }

        // TODO other states

        self.state = state;
    }

    pub fn render(&self) {
        self.gl.clear(
            WebGl2RenderingContext::COLOR_BUFFER_BIT | WebGl2RenderingContext::DEPTH_BUFFER_BIT,
        );
        self.gl.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, 3);
    }
}

/// The WebGL2 bindings.
impl Renderer {
    /// The `useProgram()` method.
    ///
    /// [MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/useProgram)
    pub fn use_program(&self, program: &Option<ShaderProgram>) {
        self.gl.use_program(program.as_ref().map(|v| &v.program));
    }

    ///The `bindBuffer()` method.
    ///
    ///[MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/bindBuffer)
    pub fn bind_buffer(&self, target: BufferTarget, buffer: &Option<Buffer>) {
        self.gl
            .bind_buffer(target.into(), buffer.as_ref().map(|v| &v.buffer));
    }

    /// The `bindBufferBase()` method.
    ///
    /// [MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/bindBufferBase)
    pub fn bind_buffer_base(&self, target: BufferTarget, index: u32, buffer: &Option<Buffer>) {
        self.gl
            .bind_buffer_base(target.into(), index, buffer.as_ref().map(|v| &v.buffer));
    }

    /// The `bindVertexArray()` method.
    ///
    /// [MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/bindVertexArray)
    pub fn bind_vertex_array(&self, vertex_array: &Option<VertexArrayObject>) {
        self.gl
            .bind_vertex_array(vertex_array.as_ref().map(|v| &v.id));
    }

    /// The `bufferData()` method.
    ///
    /// [MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/bufferData)
    pub fn buffer_data<T>(&self, target: BufferTarget, data: &[T], usage: BufferUsage) {
        self.gl
            .buffer_data_with_u8_array(target.into(), slice_as_u8_slice(data), usage.into());
    }

    /// The `enableVertexAttribArray()` method.
    ///
    /// [MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/enableVertexAttribArray)
    pub fn enable_vertex_attrib_array(&self, index: u32) {
        self.gl.enable_vertex_attrib_array(index);
    }

    /// The `vertexAttribPointer()` method.
    ///
    /// [MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/vertexAttribPointer)
    pub fn vertex_attrib_pointer(
        &self,
        index: u32,
        size: i32,
        type_: DataType,
        normalized: bool,
        stride: i32,
        offset: i32,
    ) {
        self.gl.vertex_attrib_pointer_with_i32(
            index,
            size,
            type_.into(),
            normalized,
            stride,
            offset,
        );
    }

    /// The `viewport()` method.
    ///
    /// [MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/viewport)
    pub fn viewport(&self, viewport: &Viewport) {
        self.gl
            .viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    }

    /// The `clearColor()` method.
    ///
    /// [MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/clearColor)
    pub fn clear_color(&self, color: &Color) {
        self.gl.clear_color(color.r, color.g, color.b, color.a);
    }

    /// The `clear()` method.
    ///
    /// [MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/clear)
    pub fn clear(&self, mask: Mask) {
        self.gl.clear(mask.into());
    }

    pub fn draw_arrays(&self, mode: DrawMode, first: i32, count: i32) {
        self.gl.draw_arrays(mode.into(), first, count);
    }

    pub fn get_error(&self) -> Option<ErrorType> {
        match get_error(self.gl.get_error()) {
            ErrorType::NoError => None,
            error => Some(error),
        }
    }
}
