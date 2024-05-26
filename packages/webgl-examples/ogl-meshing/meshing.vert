#version 300 es

in vec3 position;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec3 vNormal;

const vec3 NORMALS[6] = vec3[6](
  vec3(0.0, 1.0, 0.0),  // Y+ // 0
  vec3(0.0, -1.0, 0.0), // Y- // 1
  vec3(1.0, 0.0, 0.0),  // X+ // 2
  vec3(-1.0, 0.0, 0.0), // X- // 3
  vec3(0.0, 0.0, 1.0),  // Z+ // 4
  vec3(0.0, 0.0, -1.0)  // Z- // 5
);

void main() {
  vec3 normal = NORMALS[0];
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}