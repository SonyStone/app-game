uniform mat4 savedModelMatrix;
uniform mat4 viewMatrixCamera;
uniform mat4 projectionMatrixCamera;
uniform mat4 modelMatrixCamera;

varying vec4 vWorldPosition;
varying vec3 vNormal;
varying vec4 vTexCoords;


void main() {
  vNormal = mat3(savedModelMatrix) * normal;
  vWorldPosition = savedModelMatrix * vec4(position, 1.0);
  vTexCoords = projectionMatrixCamera * viewMatrixCamera * vWorldPosition;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}