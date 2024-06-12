#version 300 es
precision mediump float;

uniform vec3 u_color;

in vec2 frag_uv;
in vec4 vMVPos;

out vec4 out_color;

void main() {
  float dist = distance(frag_uv, vec2(0.5, 0.5));
  float alpha = 1.0 - smoothstep(0.0, 0.5, dist);

  vec3 color = u_color;

  if (alpha > 0.0) {
    out_color = vec4(color.rgb,alpha);
  } else {
    discard;
  }
}