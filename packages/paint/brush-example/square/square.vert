#version 300 es

uniform float zIndex;

in vec2 uv;
in vec2 position;

out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, zIndex, 1.0f);
  gl_PointSize = 5.0f;
}