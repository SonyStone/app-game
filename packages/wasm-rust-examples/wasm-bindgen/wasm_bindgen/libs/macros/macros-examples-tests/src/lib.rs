#[cfg(test)]
mod tests {
    use macros_examples::HelperAttr;

    #[repr(C)]
    // #[verify_struct]
    #[derive(Debug, HelperAttr, Clone, Copy)]
    pub struct Vertex {
        #[location(0)]
        position: [f32; 3],
        #[location(1)]
        normal: [f32; 3],
        #[location(2)]
        texcoord: [f32; 2],
    }

    #[test]
    fn test_naga_macros() {
        // verify_struct!(Vertex);
        let vertex = Vertex {
            position: [0.0, 0.0, 0.0],
            normal: [0.0, 0.0, 0.0],
            texcoord: [0.0, 0.0],
        };

        println!("🫠 test runs {:#?}", vertex);
    }
}
