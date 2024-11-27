#import inc as Inc

struct TransformMatrices {
    projection_matrix: mat4x4f,
    view_matrix: mat4x4f,
};

@binding(0) @group(0) var<uniform> transforms : TransformMatrices;

// @group(0) @binding(0) var<storage, read_write> data: array<f32>;

@vertex
fn main(
    @location(0) position: vec4f,
    @location(1) position2: vec4f,
    @builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
    let x = Inc::hello();
    let y = 0.0;
    return transforms.projection_matrix * transforms.view_matrix * vec4<f32>(x, y, 0.0, 1.0) * position;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
