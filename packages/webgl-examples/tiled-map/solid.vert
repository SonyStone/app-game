#version 300 es

uniform Camera {
  mat3 u_worldViewProjection;
};

layout(location = 0) in vec2 a_position;
layout(location = 3) in vec2 a_texcoord;
layout(location = 4) in mat3 a_worldPosition;
layout(location = 8) in vec3 a_color;

out vec2 v_texCoord;
out vec4 color;

void main() {
  color = vec4(1.0f);
  v_texCoord = a_texcoord;

  vec3 worldPos = u_worldViewProjection * a_worldPosition * vec3(a_position, 1.0f);
  gl_Position = vec4(worldPos.xy, 0.0f, 1.0f);
}