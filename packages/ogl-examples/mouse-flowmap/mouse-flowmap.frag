#version 300 es
precision highp float;

uniform sampler2D tWater;
uniform sampler2D tFlow;
uniform float uTime;

in vec2 vUv;

out vec4 FragColor;

void main() {

  // R and G values are velocity in the x and y direction
  // B value is the velocity length
  vec3 flow = texture(tFlow, vUv).rgb;

  // Use flow to adjust the uv lookup of a texture
  vec2 uv = gl_FragCoord.xy / 600.0;
  uv = uv + flow.xy * 0.05;
  vec3 tex = texture(tWater, uv).rgb;

  // Oscillate between raw values and the affected texture above
  float pct = smoothstep( -0.3, 0.7, sin(uTime));
  tex = mix(tex, flow * 0.5 + 0.5, 0.5);

  FragColor.rgb = tex;
  FragColor.a = 1.0;
}