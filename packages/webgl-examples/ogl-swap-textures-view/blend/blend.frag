#version 300 es
precision highp float;

uniform sampler2D tMap1; // Your background texture
uniform sampler2D tMap2; // Your brush stroke texture
uniform int blendMode;
uniform float uOpacity;

in vec2 vUv;

out vec4 FragColor;

vec4 multiply(vec4 color1, vec4 color2) {
    return color1 * color2;
}

vec4 screen(vec4 color1, vec4 color2) {
    return 1.0 - (1.0 - color1) * (1.0 - color2);
}

vec4 overlay(vec4 color1, vec4 color2) {
    return color1.r < 0.5 && color1.g < 0.5 && color1.b < 0.5 ? (2.0 * color1 * color2) : (1.0 - 2.0 * (1.0 - color1) * (1.0 - color2));
}

void main() {
    vec4 color1 = texture(tMap1, vUv);
    vec4 color2 = texture(tMap2, vUv);

    vec4 blendedColor;
    if (blendMode == 0) {
        blendedColor = mix(color1, color2, color2.a * uOpacity);
    } else if (blendMode == 1) {
        blendedColor = mix(color1, multiply(color1, color2), color2.a * uOpacity);
    } else if (blendMode == 2) {
        blendedColor = mix(color1, screen(color1, color2), color2.a * uOpacity);
    } else if (blendMode == 3) {
        blendedColor = mix(color1, overlay(color1, color2), color2.a * uOpacity);
    }

    FragColor = blendedColor;
}