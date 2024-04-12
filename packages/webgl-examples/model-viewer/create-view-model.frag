#version 300 es
precision highp float;

uniform sampler2D map;

in vec2 vUv;
in vec3 vNormal;
in vec4 vTangent;

out vec4 FragColor;

void main() {
    vec3 tex = texture(map, vUv).rgb;

    vec3 Tangent = normalize(vTangent.xyz);
    vec3 BiTangent  = cross(vNormal, Tangent) * vTangent.w;

    vec3 worldNormal = normalize(Tangent + BiTangent + vNormal);

    vec3 normal = worldNormal;
    float lighting = dot(vNormal, vec3(0.0, 1.0, 0.0));

    FragColor.rgb = tex + lighting * 0.25;
    FragColor.a = 1.0;
}