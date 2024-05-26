#version 300 es
precision highp float;

uniform float uTime;

in vec2 vUv;

out vec4 FragColor;

void main() {
    FragColor.rgb = 0.5 + 0.3 * sin(vUv.yxx + uTime) + vec3(0.2, 0.0, 0.1);
    FragColor.a = 1.0;
}