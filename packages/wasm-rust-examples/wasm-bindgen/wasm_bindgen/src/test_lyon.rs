extern crate lyon;
use lyon::extra::rust_logo::build_logo_path;
use lyon::path::Path;
use lyon::tessellation::*;
use math::Transform;

// Let's use our own custom vertex type instead of the default one.
#[derive(Copy, Clone, Debug)]
pub struct MyVertex {
    pub position: [f32; 2],
}

pub fn test_geometry() -> VertexBuffers<MyVertex, u16> {
    // Build a Path.
    let mut logo_builder = Path::builder().with_svg();
    build_logo_path(&mut logo_builder);
    let logo_path = logo_builder.build();
    let logo_path = logo_path
        .transformed(&Transform::scale(1.0, 1.0))
        .transformed(&Transform::translation(-0.7, -0.7));

    // Will contain the result of the tessellation.
    let mut geometry: VertexBuffers<MyVertex, u16> = VertexBuffers::new();
    let mut tessellator = FillTessellator::new();
    {
        // Compute the tessellation.
        tessellator
            .tessellate_path(
                &logo_path,
                &FillOptions::default().with_tolerance(0.0001),
                &mut BuffersBuilder::new(&mut geometry, |vertex: FillVertex| MyVertex {
                    position: vertex.position().to_array(),
                }),
            )
            .unwrap();
    }

    geometry
}

#[test]
fn test_02() {
    let geometry = test_geometry();
    // The tessellated geometry is ready to be uploaded to the GPU.
    println!(
        " -- {} vertices {} indices, first vertex {:?}",
        geometry.vertices.len(),
        geometry.indices.len(),
        geometry.vertices.first().unwrap().position
    );
}

#[test]
fn test_01() {
    println!("test_01");
}
