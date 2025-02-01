#version 300 es
precision mediump float;

in vec4 v_position;
in vec2 v_texCoord;
in vec3 v_normal;
in vec3 v_surfaceToLight;
in vec3 v_surfaceToView;
in vec4 color;

uniform vec4 u_lightColor;
uniform vec4 u_ambient;
uniform sampler2D u_diffuse;
uniform vec4 u_specular;
uniform float u_shininess;

struct TheStruct
{
  float first;
  float second;
  float third;
};

uniform TheStruct colorParts;

uniform float colors[3];


uniform float u_specularFactor;

vec4 lit(float l ,float h, float m) {
  return vec4(1.0,
              max(l, 0.0),
              (l > 0.0) ? pow(max(0.0, h), m) : 0.0,
              1.0);
}

out vec4 fragColor;

void main() {
  vec4 diffuseColor = texture(u_diffuse, v_texCoord);

  vec3 a_normal = normalize(v_normal);

  vec3 surfaceToLight = normalize(v_surfaceToLight);

  vec3 surfaceToView = normalize(v_surfaceToView);

  vec3 halfVector = normalize(surfaceToLight + surfaceToView);

  vec4 litR = lit(dot(a_normal, surfaceToLight),
                    dot(a_normal, halfVector), u_shininess);

  vec4 outColor = vec4((
    u_lightColor * (diffuseColor * litR.y + diffuseColor * u_ambient + u_specular * litR.z * u_specularFactor)).rgb,
      diffuseColor.a);

  outColor = vec4(
    outColor.r + colorParts.first + colors[0],
    outColor.g + colorParts.second + colors[1],
    outColor.b + colorParts.third + colors[2],
    outColor.a
  );

  fragColor = outColor * color;
}