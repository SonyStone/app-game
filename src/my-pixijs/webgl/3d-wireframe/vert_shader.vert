#version 100
precision mediump float;
attribute vec3 aPosition;
uniform mat4 uTransform;
uniform mat4 uViewProjection;
uniform vec3 uColor;
varying vec4 vColor;

void main() {
  gl_Position = uViewProjection * uTransform * vec4(aPosition, 1.0);
  vColor = vec4(uColor, 1.0);
}