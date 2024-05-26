#version 300 es

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec2 frag_uv;
out vec4 vMVPos;
out vec3 frag_normal;

void main() {
	frag_uv = uv;
	frag_normal = normalize(normalMatrix * normal);

	vec3 pos = position;
	float dist = pow(length(uv - 0.5), 2.0) - 0.25;
	pos.z += dist * 0.5;
	vMVPos = modelViewMatrix * vec4(pos, 1.0);

	gl_Position = projectionMatrix * vMVPos;
}