#version 100
precision mediump float;
uniform mat4 cameraPosition;
uniform mat4 cameraProjection;
uniform vec3 uColor;

attribute vec3 aPosition; // ← points
varying vec4 vColor;

void main() {
  gl_Position = cameraProjection * cameraPosition * vec4(aPosition, 1.0);
  vColor = vec4(uColor, 1.0);
}