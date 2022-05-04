#version 300 es

in vec4 position;

uniform vec4 u_offset;

void main(){
    
    gl_Position = position + u_offset;
}