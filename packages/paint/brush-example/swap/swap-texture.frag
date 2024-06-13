#version 300 es
precision highp float;

uniform sampler2D tMap;
uniform vec2 uMouse;

uniform float uOpacity;
uniform int blendMode;

in vec2 vUv;

out vec4 FragColor;

vec4 normal(vec4 color1, vec4 color2) {
    return color2;
}

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
    vec4 color = texture(tMap, vUv);

    vec2 cursor = vUv - uMouse;
    float falloff = smoothstep(0.05, 0.04, length(cursor));

    vec4 brushColor = vec4(0.2f, 0.29f, 0.86f, 1.0f);
    vec4 brush = mix(vec4(brushColor.rgb, 0.0f), brushColor, falloff);

    vec4 blendedColor;
    if (blendMode == 0) {
        blendedColor = mix(color, normal(color, brush), brush.a * uOpacity);
    } else if (blendMode == 1) {
        blendedColor = mix(color, multiply(color, brush), brush.a * uOpacity);
    } else if (blendMode == 2) {
        blendedColor = mix(color, screen(color, brush), brush.a * uOpacity);
    } else if (blendMode == 3) {
        blendedColor = mix(color, overlay(color, brush), brush.a * uOpacity);
    }

    // if (blendedColor.x == 0.0 && blendedColor.y == 0.0 && blendedColor.z == 0.0) {
    //     color.a = 0.0;
    //     return;
    // }

    color = blendedColor;  
    FragColor = color;
}