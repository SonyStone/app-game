#version 300 es
in vec2 uv;
in vec3 position;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out vec2 vUv;

void main() {
    vUv = uv;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0f);

    // gl_PointSize only applicable for gl.POINTS draw mode
    gl_PointSize = gl_Position.z * 5.0f;
}