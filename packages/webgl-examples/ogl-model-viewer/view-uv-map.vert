#version 300 es
precision highp float;

in vec4 color;
in vec2 uv;
in vec3 normal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out vec4 vColor;

void main() {
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(uv, 0.0, 1.0);
    gl_PointSize = 10.0;
}