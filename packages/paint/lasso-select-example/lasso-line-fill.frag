#version 300 es
precision mediump float;

uniform bool select;

out vec4 outColor;


void main() {
  float color = select ? 1.0 : 0.0;
  outColor = vec4(vec3(color), 1.0);
}