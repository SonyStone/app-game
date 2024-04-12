#version 300 es
uniform View {
  mat4 u_viewInverse;
  mat4 u_viewProjection;
};

uniform Lights {
  mediump vec3 u_lightWorldPos;
  mediump vec4 u_lightColor;
} lights[2];

uniform Model {
  mat4 u_world;
  mat4 u_worldInverseTranspose;
} foo;

in vec4 a_position;
in vec3 a_normal;
in vec2 a_texcoord;

out vec4 v_position;
out vec2 v_texCoord;
out vec3 v_normal;
out vec3 v_surfaceToLight;
out vec3 v_surfaceToView;

void main() {
  v_texCoord = a_texcoord;
//  v_position = (foo.u_world * u_viewProjection * a_position);
  v_position = (u_viewProjection * foo.u_world * a_position);
  v_normal = (foo.u_worldInverseTranspose * vec4(a_normal, 0)).xyz;
  v_surfaceToLight = lights[0].u_lightWorldPos - (foo.u_world * a_position).xyz;
  v_surfaceToView = (u_viewInverse[3] - (foo.u_world * a_position)).xyz;
  gl_Position = v_position;
}