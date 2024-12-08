use memoffset::offset_of;
use webgl_common::DataType;

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

pub fn get_vertex_data() -> ([Vertex; 24], [u16; 36], [AttribPointer; 3]) {
    let vertices = [
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
    let vertex_indices: [u16; 36] = [
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

    (vertices, vertex_indices, Vertex::attrib_pointer())
}

#[test]
fn test_sizes() {
    assert_eq!(std::mem::size_of::<Vertex>(), 32);
    assert_eq!(std::mem::size_of::<[f32; 3]>(), 12);
    assert_eq!(std::mem::size_of::<[f32; 2]>(), 8);
    assert_eq!(std::mem::size_of::<[u16; 2]>(), 4);
}
