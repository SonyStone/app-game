#version 300 es
precision highp float;

in vec3 vNormal;

out vec4 out_color;

void main() {
  vec3 normal = normalize(vNormal);
  float lighting = dot(normal, normalize(vec3(1.0, 1.0, 1.0)));
  out_color.rgb = vec3(0.75) + lighting * 0.25;
  out_color.a = 1.0;
}