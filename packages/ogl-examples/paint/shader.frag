#version 300 es
precision highp float;

uniform sampler2D tMap;

in vec2 frag_uv;
in vec3 frag_normal;

out vec4 out_color;

void main() {
  float lighting = 0.2 * dot(frag_normal, normalize(vec3(-0.3, 0.8, 0.6)));
  vec3 tex = texture(tMap, frag_uv).rgb;

  // ivec2 fCoord = ivec2(gl_FragCoord.xy);
  // ivec2 texSize = textureSize( tMap, 0 );
  // vec4 color = texelFetch(tMap, fCoord, 0 );
  // out_color = color;		

  out_color.rgb = tex + lighting + vec3(frag_uv - 0.5, 0.0) * 0.1;
  out_color.a = 0.0;
}