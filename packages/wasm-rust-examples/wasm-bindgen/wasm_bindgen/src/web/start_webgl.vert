#version 300 es

precision highp float;
precision highp int;

layout(location=0)in vec4 _p2vs_location0;

void main(){
    vec4 position=_p2vs_location0;
    gl_Position=position;
    gl_Position.yz=vec2(-gl_Position.y,gl_Position.z*2.-gl_Position.w);
    return;
}
