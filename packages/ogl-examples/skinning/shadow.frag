precision highp float;

uniform sampler2D tMap;

varying vec2 vUv;

void main() {
    float shadow = texture2D(tMap, vUv).g;

    gl_FragColor.rgb = vec3(0.0);
    gl_FragColor.a = shadow;
}