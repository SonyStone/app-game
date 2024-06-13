#version 300 es
in vec2 uv;
in vec2 position;
in vec2 uv2;

out vec2 vUv;
out vec2 vUv2;

void main() {
  vUv = uv;
  vUv2 = uv2;
  gl_Position = vec4(position, 0, 1);
}