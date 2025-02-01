#version 300 es

uniform Camera {
  mat4 u_worldViewProjection;
};

layout(location = 0) in vec4 a_position;
layout(location = 4) in mat4 a_worldPosition;

out vec4 color;

void main() {
  color = vec4(0.0f, 0.0f, 0.0f, 1.0f);

  gl_Position = u_worldViewProjection * a_worldPosition * a_position;
}