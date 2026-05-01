#version 300 es

uniform Camera {
  mat3 u_worldViewProjection;
};

layout(location = 0) in vec2 a_position;
layout(location = 4) in mat3 a_worldPosition;

out vec4 color;

void main() {
  color = vec4(0.0f, 0.0f, 0.0f, 1.0f);

  vec3 worldPos = u_worldViewProjection * a_worldPosition * vec3(a_position, 1.0f);
  gl_Position = vec4(worldPos.xy, 0.0f, 1.0f);
}