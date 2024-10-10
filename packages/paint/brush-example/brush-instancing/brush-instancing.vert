#version 300 es
in vec2 uv;
in vec2 position;
in float size;
in vec2 offset;
in float opacity;

out vec2 vUv;
out float vOpacity;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;

void main() {
  vUv = uv;
  vOpacity = opacity;

  mat3 modelMatrix = mat3(1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f);
  mat3 modelViewProjectionMatrix = uProjectionMatrix * uWorldTransformMatrix * modelMatrix;

  vec2 coord = (position / 25.0f * (size)) + offset;

  gl_Position = vec4((modelViewProjectionMatrix * vec3(coord, 1.0f)).xy, 0.0f, 1.0f);
}