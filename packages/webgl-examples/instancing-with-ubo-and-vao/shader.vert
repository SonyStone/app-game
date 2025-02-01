#version 300 es

uniform Camera {
  mat4 u_worldViewProjection;
};

layout(location = 0) in vec4 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 3) in vec2 a_texcoord;
layout(location = 4) in mat4 a_worldPosition;
layout(location = 8) in vec3 a_color;

out vec2 v_texCoord;
out vec4 color;

void main() {
  color = vec4(a_color, 1.0f);
  v_texCoord = a_texcoord;

  gl_Position = u_worldViewProjection * a_worldPosition * a_position;
}