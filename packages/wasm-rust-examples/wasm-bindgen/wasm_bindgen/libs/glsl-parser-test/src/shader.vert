#version 300 es

struct SomeStruct{
    bool active_value;
    vec2 someVec2;
};
uniform SomeStruct u_someThing;

layout(location=0)in vec4 position;
layout(location=1)in vec3 normal;
layout(location=3)in vec2 texcoord;

uniform mat4 projection;
uniform mat4 modelView;

out vec3 v_normal;
out vec2 v_texcoord;

void main(){
    gl_Position=projection*modelView*position;
    v_normal=mat3(modelView)*normal;
    v_texcoord=texcoord;
}