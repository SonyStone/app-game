#version 300 es
precision mediump float;

uniform vec4 u_color;

in vec2 frag_uv;

out vec4 out_color;

void main() {
  float dist = distance(frag_uv, vec2(0.5, 0.5));
  float alpha = 1.0 - smoothstep(0.4, 0.5, dist);

  if (alpha > 0.0) {
    out_color = vec4(u_color.rgb * u_color.a, u_color.a) * alpha;
  } else {
    discard;
  }
}