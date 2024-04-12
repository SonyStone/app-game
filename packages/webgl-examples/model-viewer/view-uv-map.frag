#version 300 es
precision highp float;

out vec4 FragColor;

void main() {
    FragColor.rgb = vec3(1., 0.1, 0.1);
    FragColor.a = 1.0;
}