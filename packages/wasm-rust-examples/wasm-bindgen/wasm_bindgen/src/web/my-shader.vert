#version 310 es

precision highp float;
precision highp int;


void main() {
    uint in_vertex_index = uint(gl_VertexID);
    float x = float((int(in_vertex_index) - 1));
    float y = float(((int((in_vertex_index & 1u)) * 2) - 1));
    gl_Position = vec4(x, y, 0.0, 1.0);
    gl_Position.yz = vec2(-gl_Position.y, gl_Position.z * 2.0 - gl_Position.w);
    return;
}

