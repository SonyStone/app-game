use memoffset::offset_of;
use std::rc::Rc;
use web_sys::{
    HtmlCanvasElement, WebGl2RenderingContext, WebGlBuffer, WebGlProgram, WebGlTexture,
    WebGlVertexArrayObject,
};
use webgl_common::{slice_as_u8_slice, DataType};

use crate::set_element_array_buffer;

#[repr(C)]
pub struct Vertex {
    position: [f32; 3],
    normal: [f32; 3],
    texcoord: [f32; 2],
}

#[derive(Debug, Clone, Copy)]
pub struct AttribPointer {
    pub name: &'static str,
    pub location: Option<u32>,
    pub size: i32,
    pub data_type: DataType,
    pub normalized: bool,
    pub stride: i32,
    pub offset: i32,
}

impl Vertex {
    pub fn new(position: [f32; 3], normal: [f32; 3], texcoord: [f32; 2]) -> Self {
        Self {
            position,
            normal,
            texcoord,
        }
    }

    pub fn attrib_pointer() -> [AttribPointer; 3] {
        [
            AttribPointer {
                name: "position",
                location: Some(0),
                size: 3,
                data_type: DataType::Float,
                normalized: false,
                stride: Vertex::size(),
                offset: Vertex::position_offset(),
            },
            AttribPointer {
                name: "normal",
                location: Some(1),
                size: 3,
                data_type: DataType::Float,
                normalized: false,
                stride: Vertex::size(),
                offset: Vertex::normal_offset(),
            },
            AttribPointer {
                name: "texcoord",
                location: Some(2),
                size: 2,
                data_type: DataType::Float,
                normalized: false,
                stride: Vertex::size(),
                offset: Vertex::texcoord_offset(),
            },
        ]
    }

    pub fn size() -> i32 {
        std::mem::size_of::<Vertex>() as i32
    }

    pub fn position_offset() -> i32 {
        offset_of!(Vertex, position) as i32
    }

    pub fn position_size() -> i32 {
        std::mem::size_of::<[f32; 3]>() as i32
    }

    pub fn normal_offset() -> i32 {
        offset_of!(Vertex, normal) as i32
    }

    pub fn normal_size() -> i32 {
        std::mem::size_of::<[f32; 3]>() as i32
    }

    pub fn texcoord_offset() -> i32 {
        offset_of!(Vertex, texcoord) as i32
    }

    pub fn texcoord_size() -> i32 {
        std::mem::size_of::<[f32; 2]>() as i32
    }
}

pub fn get_vertex_data() -> (Vec<Vertex>, Vec<u16>) {
    let vertices = vec![
        Vertex::new([1.0, 1.0, -1.0], [1.0, 0.0, 0.0], [1.0, 0.0]), // face 1
        Vertex::new([1.0, 1.0, 1.0], [1.0, 0.0, 0.0], [0.0, 0.0]),
        Vertex::new([1.0, -1.0, 1.0], [1.0, 0.0, 0.0], [0.0, 1.0]),
        Vertex::new([1.0, -1.0, -1.0], [1.0, 0.0, 0.0], [1.0, 1.0]),
        Vertex::new([-1.0, 1.0, 1.0], [-1.0, 0.0, 0.0], [1.0, 0.0]), // face 2
        Vertex::new([-1.0, 1.0, -1.0], [-1.0, 0.0, 0.0], [0.0, 0.0]),
        Vertex::new([-1.0, -1.0, -1.0], [-1.0, 0.0, 0.0], [0.0, 1.0]),
        Vertex::new([-1.0, -1.0, 1.0], [-1.0, 0.0, 0.0], [1.0, 1.0]),
        Vertex::new([-1.0, 1.0, 1.0], [0.0, 1.0, 0.0], [1.0, 0.0]), // face 3
        Vertex::new([1.0, 1.0, 1.0], [0.0, 1.0, 0.0], [0.0, 0.0]),
        Vertex::new([1.0, 1.0, -1.0], [0.0, 1.0, 0.0], [0.0, 1.0]),
        Vertex::new([-1.0, 1.0, -1.0], [0.0, 1.0, 0.0], [1.0, 1.0]),
        Vertex::new([-1.0, -1.0, -1.0], [0.0, -1.0, 0.0], [1.0, 0.0]), // face 4
        Vertex::new([1.0, -1.0, -1.0], [0.0, -1.0, 0.0], [0.0, 0.0]),
        Vertex::new([1.0, -1.0, 1.0], [0.0, -1.0, 0.0], [0.0, 1.0]),
        Vertex::new([-1.0, -1.0, 1.0], [0.0, -1.0, 0.0], [1.0, 1.0]),
        Vertex::new([1.0, 1.0, 1.0], [0.0, 0.0, 1.0], [1.0, 0.0]), // face 5
        Vertex::new([-1.0, 1.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0]),
        Vertex::new([-1.0, -1.0, 1.0], [0.0, 0.0, 1.0], [0.0, 1.0]),
        Vertex::new([1.0, -1.0, 1.0], [0.0, 0.0, 1.0], [1.0, 1.0]),
        Vertex::new([-1.0, 1.0, -1.0], [0.0, 0.0, -1.0], [1.0, 0.0]), // face 6
        Vertex::new([1.0, 1.0, -1.0], [0.0, 0.0, -1.0], [0.0, 0.0]),
        Vertex::new([1.0, -1.0, -1.0], [0.0, 0.0, -1.0], [0.0, 1.0]),
        Vertex::new([-1.0, -1.0, -1.0], [0.0, 0.0, -1.0], [1.0, 1.0]),
    ];

    // vertex indices for the triangles of a cube
    // the data above defines 24 vertices. We need to draw 12
    // triangles, 2 for each size, each triangle needs
    // 3 vertices so 12 * 3 = 36
    let vertex_indices: Vec<u16> = vec![
        0, 1, 2, // face 1
        0, 2, 3, //
        4, 5, 6, // face 2
        4, 6, 7, //
        8, 9, 10, // face 3
        8, 10, 11, //
        12, 13, 14, // face 4
        12, 14, 15, //
        16, 17, 18, // face 5
        16, 18, 19, //
        20, 21, 22, // face 6
        20, 22, 23, //
    ];

    (vertices, vertex_indices)
}

pub struct Attributes {
    gl: Rc<WebGl2RenderingContext>,
    vertex: Vec<Vertex>,
    indices: Vec<u16>,
    pub vao: WebGlVertexArrayObject,
    buffer: WebGlBuffer,
}

impl Attributes {
    pub fn new(
        gl: Rc<WebGl2RenderingContext>,
        prg: &WebGlProgram,
        vertex: Vec<Vertex>,
        indices: Vec<u16>,
    ) -> Self {
        let vao = gl.create_vertex_array().unwrap();
        gl.bind_vertex_array(Some(&vao));

        let buffer = gl.create_buffer().unwrap();
        gl.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(&buffer));
        gl.buffer_data_with_u8_array(
            WebGl2RenderingContext::ARRAY_BUFFER,
            slice_as_u8_slice(&vertex),
            WebGl2RenderingContext::STATIC_DRAW,
        );

        let attributes = Vertex::attrib_pointer();
        attributes.iter().for_each(|attr| {
            let i = match attr.location {
                Some(i) => i,
                None => gl.get_attrib_location(prg, attr.name) as u32,
            };
            gl.enable_vertex_attrib_array(i);
            gl.vertex_attrib_pointer_with_i32(
                i,
                attr.size,
                attr.data_type.into(),
                attr.normalized,
                attr.stride,
                attr.offset,
            );
        });

        set_element_array_buffer(&gl, &indices, WebGl2RenderingContext::STATIC_DRAW);

        // This is not really needed but if we end up binding anything
        // to ELEMENT_ARRAY_BUFFER, say we are generating indexed geometry
        // we'll change cubeVertexArray's ELEMENT_ARRAY_BUFFER. By binding
        // null here that won't happen.
        gl.bind_vertex_array(None);

        Self {
            gl,
            vertex,
            indices,
            vao,
            buffer,
        }
    }
}

#[test]
fn test_sizes() {
    assert_eq!(std::mem::size_of::<Vertex>(), 32);
    assert_eq!(std::mem::size_of::<[f32; 3]>(), 12);
    assert_eq!(std::mem::size_of::<[f32; 2]>(), 8);
    assert_eq!(std::mem::size_of::<[u16; 2]>(), 4);
    assert_eq!(std::mem::size_of::<[f32; 2]>(), 8);
    assert_eq!(std::mem::size_of::<[u16; 2]>(), 4);
}
