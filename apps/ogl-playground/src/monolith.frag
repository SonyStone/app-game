precision highp float;

uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uTime;

varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vec3 lightDir = normalize(vec3(0.4, 0.8, 0.6));
  float diffuse = max(dot(normalize(vNormal), lightDir), 0.0);
  float band = 0.5 + 0.5 * sin(vPosition.y * 3.0 + uTime * 0.7);
  vec3 color = mix(uColorA, uColorB, band);
  color += diffuse * 0.4;
  color += vec3(0.08, 0.04, 0.02);
  gl_FragColor = vec4(color, 1.0);
}