precision highp float;

uniform sampler2D tMap;
uniform vec3 uColor;

varying vec2 vUv;
varying vec4 vMVPos;

void main() {
  float alpha = texture2D(tMap, vUv).g;

  vec3 color = uColor + vMVPos.xzy * 0.05;

  float dist = length(vMVPos);
  float fog = smoothstep(5.0, 10.0, dist);
  color = mix(color, vec3(1.0), fog);

  gl_FragColor.rgb = color;
  gl_FragColor.a = alpha;
  if (alpha < 0.01) discard;
}