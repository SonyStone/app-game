@vertex
fn vs_main(@location(0) position: vec4f) -> @builtin(position) vec4f {
    return position;
}

@fragment
fn fs_main() -> @location(0) vec4f {
    return vec4f(1, 1, 1, 1);
}