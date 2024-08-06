#version 300 es
precision highp float;
precision highp int;

uniform sampler2D tMap;

in vec2 vUv;

out vec4 FragColor;

void main() {
    vec4 color = texture(tMap, vUv);
    FragColor = color;
}