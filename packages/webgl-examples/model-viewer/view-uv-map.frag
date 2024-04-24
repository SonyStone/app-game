#version 300 es
precision highp float;

in vec4 vColor;

out vec4 FragColor;

void main() {
    FragColor.rgb = vec3(1., 0.5, 0.5);
    FragColor.a = 1.0;
}