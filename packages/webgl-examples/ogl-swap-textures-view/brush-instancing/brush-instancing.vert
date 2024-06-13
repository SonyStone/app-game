#version 300 es
in vec2 uv;
in vec2 position;
in vec2 offset;
in float opacity;

out vec2 vUv;
out float vOpacity;

void main() {
  vUv = uv;
  vOpacity = opacity;
  gl_Position = vec4(((position / 10.0f) * 1.f) - 1.f + offset * 2.f, 0, 1);
}