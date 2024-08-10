#version 300 es
in vec2 uv;
in vec2 position;
in float size;
in vec2 offset;
in float opacity;

out vec2 vUv;
out float vOpacity;

void main() {
  vUv = uv;
  vOpacity = opacity;
  gl_Position = vec4((position / 25.0f * (size)) + offset, 0, 1);
}