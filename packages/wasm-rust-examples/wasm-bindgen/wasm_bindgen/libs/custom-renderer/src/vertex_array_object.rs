use web_sys::{WebGl2RenderingContext, WebGlVertexArrayObject};

use webgl_common::DataType;

use crate::buffer::Buffer;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VertexArrayObject<'a> {
    gl: &'a WebGl2RenderingContext,
    pub id: WebGlVertexArrayObject,
    pub attribs: Vec<VertexAttrib<'a>>,
}

impl<'a> VertexArrayObject<'a> {
    pub fn new(gl: &'a WebGl2RenderingContext) -> Self {
        let id = gl
            .create_vertex_array()
            .expect("Unable to create vertex array object");
        Self {
            id,
            gl,
            attribs: vec![],
        }
    }

    pub fn bind(&self) {
        self.gl.bind_vertex_array(Some(&self.id));
    }

    pub fn unbind(&self) {
        self.gl.bind_vertex_array(None);
    }

    pub fn add_buffer(&mut self, buffer: &'a Buffer, location: u32, options: AttributeOptions) {
        let attribute = VertexAttrib::new(self.gl, location, buffer)
            .enable()
            .pointer(
                options.size,
                options.data_type,
                options.normalized,
                options.stride,
                options.offset,
            );
        self.attribs.push(attribute);
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, Default)]
pub struct AttributeOptions {
    pub size: i32,
    pub data_type: DataType,
    pub normalized: bool,
    pub stride: i32,
    pub offset: i32,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct VertexAttrib<'a> {
    gl: &'a WebGl2RenderingContext,
    buffer: &'a Buffer<'a>,
    location: u32,
}

impl<'a> VertexAttrib<'a> {
    pub fn new(gl: &'a WebGl2RenderingContext, location: u32, buffer: &'a Buffer) -> Self {
        Self {
            gl,
            location,
            buffer,
        }
    }

    pub fn enable(self) -> Self {
        self.gl.enable_vertex_attrib_array(self.location);
        self
    }

    pub fn disable(self) -> Self {
        self.gl.disable_vertex_attrib_array(self.location);
        self
    }

    pub fn pointer(
        self,
        size: i32,
        data_type: DataType,
        normalized: bool,
        stride: i32,
        offset: i32,
    ) -> Self {
        self.gl.vertex_attrib_pointer_with_i32(
            self.location,
            size,
            data_type.into(),
            normalized,
            stride,
            offset,
        );
        self
    }
}
