#version 300 es
precision highp float;

uniform sampler2D tIpnut;
uniform sampler2D tBrush;
uniform float uOpacity;
uniform int blendMode;
uniform vec3 uColor;

in vec2 vUv;
in vec2 vUv2;

out vec4 FragColor;

vec4 multiply(vec4 color1, vec4 color2) {
    return color1 * color2;
}

void main() {
    vec4 colorBg = texture(tIpnut, vUv);
    vec4 colorBrush = texture(tBrush, vUv2);

    vec4 brush = vec4(uColor, 1.0f);

    vec4 blendedColor;
    if (blendMode == 0) {
        blendedColor = mix(colorBg, brush, colorBrush.a * uOpacity);
    } else if (blendMode == 1) {
        blendedColor = mix(colorBg, multiply(colorBg, brush), colorBrush.a * uOpacity);
    }

    FragColor = blendedColor;
}