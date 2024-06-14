#version 300 es
in vec2 uv;
in vec2 position;

out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0f, 1.0f);
  gl_PointSize = 5.0f;
}