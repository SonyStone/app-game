#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=2) in vec2 a_uv;

void main(){
	//frag_uv     = a_uv;
	gl_Position = vec4( a_pos, 1.0 );
}