@vertex fn vertexShader(
  @builtin(vertex_index) vertexIndex : u32
) -> @builtin(position) vec4f {
  let pos = array(
    vec2f( 0.0,  0.5),  // top center
    vec2f(-0.5, -0.5),  // bottom left
    vec2f( 0.5, -0.5),   // bottom right
    // other one
    vec2f( 0.0, -0.9),   
    vec2f( -0.9, -0.9),  
    vec2f( -0.9, 0)
  );

  return vec4f(pos[vertexIndex], 0.0, 1.0);
}

@fragment fn fragmentShader() -> @location(0) vec4f {
  return vec4f(1.0, 0.0, 0.0, 1.0);
}