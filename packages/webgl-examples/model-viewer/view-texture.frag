#version 300 es
precision highp float;

uniform sampler2D map;

in vec2 vUv;
in vec3 vNormal;

out vec4 FragColor;

void main() {
    vec3 tex = texture(map, vUv).rgb;

    float lighting = dot(vNormal, vec3(0.0, 1.0, 0.0));

    FragColor.rgb = tex + lighting * 0.25;
    FragColor.a = 1.0;
}