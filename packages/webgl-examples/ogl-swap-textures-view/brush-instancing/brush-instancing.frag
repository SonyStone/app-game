#version 300 es
precision highp float;

uniform sampler2D tBrush;

in vec2 vUv;

out vec4 FragColor;

void main() {
    vec4 colorBrush = texture(tBrush, vUv);

    FragColor = colorBrush;
}