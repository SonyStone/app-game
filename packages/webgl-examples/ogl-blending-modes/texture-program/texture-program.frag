#version 300 es
precision highp float;

uniform sampler2D tMap;
uniform sampler2D tMap2;
uniform float opacity;
uniform float u_time;

in vec2 vUv;
in vec3 vNormal;

out vec4 FragColor;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 tex = texture(tMap, vUv).rgb;
  vec3 tex2 = texture(tMap2, vUv).rgb;

  float pct = abs(sin(u_time / 2.0));
  vec3 color = mix(tex, tex2, pct);

  vec3 light = normalize(vec3(0.5, 1.0, -0.3));
  float shading = dot(normal, light) * 0.15;

  FragColor.rgb = color + shading;
  FragColor.a = opacity;
}