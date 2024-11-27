use web_sys::{WebGl2RenderingContext, WebGlVertexArrayObject};

use crate::bindable::Bindable;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VertexArrayObject {
    pub id: WebGlVertexArrayObject,
}

impl VertexArrayObject {
    pub fn new(gl: &WebGl2RenderingContext) -> Self {
        let id = gl
            .create_vertex_array()
            .expect("Unable to create vertex array object");
        Self { id }
    }
}

impl Bindable for VertexArrayObject {
    fn bind(&self, gl: &WebGl2RenderingContext) {
        gl.bind_vertex_array(Some(&self.id));
    }
}
