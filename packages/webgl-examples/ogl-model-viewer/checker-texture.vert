#version 300 es
precision highp float;

in vec2 uv;
in vec3 position;
in vec3 normal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec2 vUv;
out vec3 vNormal;

void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 10.0;
}