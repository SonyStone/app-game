#version 300 es

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec2 uv;
in vec2 position;

out vec2 vUv;

void main() {
		vUv = uv;
		gl_Position =  vec4(position, 0, 1);
}