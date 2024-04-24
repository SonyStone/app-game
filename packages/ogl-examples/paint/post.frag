#version 300 es
precision highp float;

uniform sampler2D tMap;

in vec2 vUv;

out vec4 FragColor;

void main() {
    vec4 tex = texture(tMap, vUv);
    vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
    FragColor = tex + color;
}