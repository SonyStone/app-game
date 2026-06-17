attribute vec3 position;
attribute vec3 normal;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vec3 pos = position;

  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vPosition = worldPosition.xyz;
  vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}