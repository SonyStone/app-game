// #[cfg(test)]
// mod tests {
//     use macros_examples::HelperAttr;

//     #[repr(C)]
//     // #[verify_struct]
//     #[derive(Debug, HelperAttr, Clone, Copy)]
//     pub struct Vertex {
//         #[location(0)]
//         position: [f32; 3],
//         #[location(1)]
//         normal: [f32; 3],
//         #[location(2)]
//         texcoord: [f32; 2],
//     }

//     #[test]
//     fn test_naga_macros() {
//         // verify_struct!(Vertex);
//         let vertex = Vertex {
//             position: [0.0, 0.0, 0.0],
//             normal: [0.0, 0.0, 0.0],
//             texcoord: [0.0, 0.0],
//         };

//         println!("🫠 test runs {:#?}", vertex);
//     }
// }

#[cfg(test)]
mod tests2 {

    use macros_examples::glsl_parser;

    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct Vertex {
        position: [f32; 3],
        normal: [f32; 3],
        texcoord: [f32; 2],
    }

    #[repr(C)]
    #[derive(Debug, Clone, Copy)]
    pub struct Camera {
        projection: [f32; 16],
    }

    #[test]
    fn test_macros() {
        let frag = include_str!("shader.frag");
        let vert = include_str!("shader.vert");

        glsl_parser!(Vertex, frag, vert);

        println!("🟢 done {:#?}", frag);
    }
}
