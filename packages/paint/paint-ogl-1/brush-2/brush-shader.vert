#version 300 es

in vec2 position;
in vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec2 frag_uv;

void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 0.0, 1.0);
	frag_uv = uv;
}