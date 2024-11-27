struct TransformMatrices {
    projection_matrix: mat4x4f,
    view_matrix: mat4x4f,
};

@binding(1) @group(0) var<uniform> transforms : TransformMatrices;
@binding(0) @group(0) var<uniform> color : vec4f;

@vertex
fn vs_main(@location(0) position: vec4f) -> @builtin(position) vec4f {
    return transforms.projection_matrix * transforms.view_matrix * position;
}

@fragment
fn fs_main() -> @location(0) vec4f {
    return color;
}