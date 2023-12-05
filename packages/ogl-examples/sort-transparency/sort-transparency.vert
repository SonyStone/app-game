attribute vec2 uv;
attribute vec3 position;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

varying vec2 vUv;
varying vec4 vMVPos;

void main() {
    vUv = uv;
    vec3 pos = position;
    float dist = pow(length(vUv - 0.5), 2.0) - 0.25;
    pos.z += dist * 0.5;
    vMVPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * vMVPos;
}