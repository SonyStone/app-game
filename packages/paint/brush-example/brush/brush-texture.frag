#version 300 es
precision highp float;

uniform vec3 uColor;

in vec2 vUv;

out vec4 FragColor;

void main() {
    vec2 uMouse = vec2(0.5, 0.5);
    vec2 cursor = vUv - uMouse;
    // float falloff = pow(smoothstep(.5, 0.0, length(cursor)), 4.) * .1;
    float falloff = smoothstep(.5, 0.1, length(cursor));

    vec4 brushColor = vec4(uColor, 1.0f);
    vec4 brush = mix(vec4(brushColor.rgb, 0.0f), brushColor, falloff);

    vec4 blendedColor = brush;
    FragColor = blendedColor;
}