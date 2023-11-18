precision highp float;

uniform sampler2D tMap;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
    vec3 tex = texture2D(tMap, vUv).rgb;

    vec3 normal = normalize(vNormal);
    vec3 light = vec3(0.0, 1.0, 0.0);
    float shading = min(0.0, dot(normal, light) * 0.2);

    gl_FragColor.rgb = tex + shading;
    gl_FragColor.a = 1.0;
}