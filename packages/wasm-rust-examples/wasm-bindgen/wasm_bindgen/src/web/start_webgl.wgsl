struct TransformMatrices {
    projection_matrix: mat4x4f,
    view_matrix: mat4x4f,
};

@binding(0) @group(0) var<uniform> transforms : TransformMatrices;

@vertex
fn vs_main(@location(0) position: vec4f) -> @builtin(position) vec4f {
    return transforms.projection_matrix * transforms.view_matrix * position ;
}

@fragment
fn fs_main() -> @location(0) vec4f {
    return vec4f(1, 1, 1, 1);
}