#version 300 es
precision highp float;

in vec3 v_normal;
in vec2 v_texcoord;

uniform sampler2D diffuse;
uniform vec4 diffuseMult;
uniform vec3 lightDir;

out vec4 outColor;

void main(){
    vec3 normal=normalize(v_normal);
    float light=dot(normal,lightDir)*.5+.5;
    vec4 color=texture(diffuse,v_texcoord)*diffuseMult;
    outColor=vec4(color.rgb*light,color.a);
}