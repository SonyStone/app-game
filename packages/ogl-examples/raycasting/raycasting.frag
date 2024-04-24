precision highp float;

uniform float uHit;

varying vec3 vNormal;

void main() {
    vec3 normal = normalize(vNormal);
    float lighting = dot(normal, normalize(vec3(-0.3, 0.8, 0.6)));
    vec3 color = mix(vec3(0.2, 0.8, 1.0), vec3(1.0, 0.2, 0.8), uHit);
    gl_FragColor.rgb = color + lighting * 0.1;
    gl_FragColor.a = 1.0;
}