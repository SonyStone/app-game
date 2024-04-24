#version 300 es
precision highp float;

in vec3 vNormal;

out vec4 FragColor;

void main() {
    vec3 normal = normalize(vNormal);
    float lighting = dot(normal, normalize(vec3(1.0, 1.0, 1.0)));

    FragColor.rgb = vec3(0.75) + lighting * 0.25;
    FragColor.a = 1.0;
}