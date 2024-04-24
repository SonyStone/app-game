#version 300 es
precision highp float;
precision highp int;

in vec3 vNormal;

out vec4 FragColor;

void main() {
    FragColor.rgb = normalize(vNormal);
    FragColor.a = 1.0;
}