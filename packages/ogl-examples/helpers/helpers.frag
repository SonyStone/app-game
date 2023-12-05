precision highp float;

varying vec3 vNormal;

void main() {
  vec3 normal = normalize(vNormal);
  float lighting = dot(normal, normalize(vec3(1.0, 1.0, 1.0)));
  gl_FragColor.rgb = vec3(0.75) + lighting * 0.25;
  gl_FragColor.a = 1.0;
}