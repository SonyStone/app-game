use std::{collections::HashMap, mem::swap};

use crate::{
    buffer::Buffer,
    renderer_state::RendererState,
    shader_program::{create_shader_program, ShaderProgram},
    vertex_array_object::VertexArrayObject,
};
use web_sys::{console, WebGl2RenderingContext, WebGlProgram};
use webgl_common::{
    get_error, slice_as_u8_slice, BufferTarget, BufferUsage, Color, DataType, DrawMode, ErrorType,
    Mask, Viewport,
};

/// The WebGL2 renderer.
#[derive(Debug, Clone)]
pub struct Renderer<'a> {
    pub gl: web_sys::WebGl2RenderingContext,
    pub state: RendererState<'a>,
}

impl<'a> Renderer<'a> {
    pub fn new(gl: WebGl2RenderingContext) -> Self {
        Self {
            gl,
            state: RendererState::default(),
        }
    }

    pub fn render(&self) {
        self.gl.clear(
            WebGl2RenderingContext::COLOR_BUFFER_BIT | WebGl2RenderingContext::DEPTH_BUFFER_BIT,
        );
        self.gl.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, 3);
    }
}

impl<'a> Renderer<'a> {
    pub fn create_shader_program(
        &self,
        vert_src: &str,
        frag_src: &str,
    ) -> Result<WebGlProgram, String> {
        create_shader_program(&self.gl, vert_src, frag_src)
    }

    /// The `useProgram()` method.
    ///
    /// [MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/useProgram)
    pub fn use_program(&mut self, program: &'a WebGlProgram) {
        self.state.program = Some(program);
        self.gl.use_program(Some(program));
    }
}

impl<'a> Renderer<'a> {
    pub fn bind_array_buffer(&mut self, buffer: &'a Buffer) {
        self.state.array_buffer = Some(buffer);
        buffer.bind(BufferTarget::ArrayBuffer);
    }

    pub fn set_array_buffer_data<T>(
        &mut self,
        data: &[T],
        mut buffer: Buffer<'a>,
        usage: BufferUsage,
    ) -> Buffer<'a> {
        buffer.bind(BufferTarget::ArrayBuffer);
        buffer.set_data(BufferTarget::ArrayBuffer, data, usage);
        buffer
    }
}

impl<'a> Renderer<'a> {
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
    pub fn bind_vertex_array(&self, vertex_array: &Option<&VertexArrayObject>) {
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
        self.gl.viewport(
            viewport.x,
            viewport.y,
            viewport.width as i32,
            viewport.height as i32,
        );
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
