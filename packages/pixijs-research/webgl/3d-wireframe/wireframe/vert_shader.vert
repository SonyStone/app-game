#version 100
precision mediump float;
uniform mat4 camera;
uniform vec3 uColor;

attribute vec3 aPosition; // ← points
varying vec4 vColor;

void main() {
  gl_Position = camera * vec4(aPosition, 1.0);
  vColor = vec4(uColor, 1.0);
}