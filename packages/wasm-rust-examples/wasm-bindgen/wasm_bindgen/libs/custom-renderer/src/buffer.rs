use web_sys::{WebGl2RenderingContext, WebGlBuffer};

use crate::bindable::Bindable;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Buffer {
    pub buffer: WebGlBuffer,
    // Buffer type and usage
}

impl Buffer {
    pub fn new(gl: &WebGl2RenderingContext) -> Self {
        let buffer = gl.create_buffer().expect("Failed to create buffer");
        Buffer { buffer }
    }
}

impl Bindable for Buffer {
    fn bind(&self, gl: &WebGl2RenderingContext) {
        gl.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(&self.buffer));
    }
}
