#version 300 es
precision highp float;

uniform float uTime;
uniform sampler2D tMap;

in vec2 vUv;

out vec4 FragColor;

void main() {
    vec3 tex = texture(tMap, vUv).rgb;

    FragColor.rgb = tex;
    FragColor.a = 1.0;
}