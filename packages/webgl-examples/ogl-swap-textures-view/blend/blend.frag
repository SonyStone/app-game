#version 300 es
precision highp float;

uniform sampler2D tMap1; // Your background texture
uniform sampler2D tMap2; // Your brush stroke texture
uniform int blendMode;
uniform int colorBlendMode;
uniform float uOpacity;

in vec2 vUv;

out vec4 FragColor;

vec4 rgb2hsv(vec4 rgb)
{
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(rgb.bg, K.wz), vec4(rgb.gb, K.xy), step(rgb.b, rgb.g));
    vec4 q = mix(vec4(p.xyw, rgb.r), vec4(rgb.r, p.yzx), step(p.x, rgb.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec4(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x, rgb.a);
}

vec4 hsv2rgb(vec4 hsv) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(hsv.xxx + K.xyz) * 6.0 - K.www);
    return  vec4(hsv.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), hsv.y), hsv.a);
}

vec4 gammaToLinear(vec4 color, float gamma) {
    return vec4(pow(color.rgb, vec3(gamma)), color.a);
}

vec4 linearToGamma(vec4 color, float gamma) {
    return vec4(pow(color.rgb, vec3(1.0 / gamma)), color.a);
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
    vec4 color1Src = texture(tMap1, vUv);
    vec4 color2Src = texture(tMap2, vUv);

    vec4 color1;
    vec4 color2;
    
    // Convert to the same color space
    if (colorBlendMode == 0) {
        color1 = color1Src;
        color2 = color2Src;
    } else if (colorBlendMode == 1) {
        // Convert from gamma space to linear space
        color1 = gammaToLinear(color1Src, 2.2);
        color2 = gammaToLinear(color2Src, 2.2);
    } else if (colorBlendMode == 2) {
        color1 = rgb2hsv(color1Src);
        color2 = rgb2hsv(color2Src);
    }

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

    // Convert back to the original color space
    if (colorBlendMode == 1) {
        // Convert from linear space to gamma space
        blendedColor = linearToGamma(blendedColor, 2.2);
    } else if (colorBlendMode == 2) {
        blendedColor = hsv2rgb(blendedColor);
    }

    FragColor = blendedColor;
}