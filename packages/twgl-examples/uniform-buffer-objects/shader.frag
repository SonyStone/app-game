#version 300 es
precision mediump float;

in vec4 v_position;
in vec2 v_texCoord;
in vec3 v_normal;
in vec3 v_surfaceToLight;
in vec3 v_surfaceToView;

uniform Lights {
  vec3 u_lightWorldPos;
  vec4 u_lightColor;
} lights[2];

uniform sampler2D u_diffuse;

uniform Material {
  vec4 u_ambient;
  vec4 u_specular;
  float u_shininess;
  float u_specularFactor;
};

out vec4 theColor;

vec4 lit(float l ,float h, float m) {
  return vec4(1.0,
              max(abs(l), 0.0),
              (l > 0.0) ? pow(max(0.0, h), m) : 0.0,
              1.0);
}



void main() {
  vec4 diffuseColor = texture(u_diffuse, v_texCoord);
  vec3 a_normal = normalize(v_normal);
  vec3 surfaceToLight = normalize(v_surfaceToLight);
  vec3 surfaceToView = normalize(v_surfaceToView);
  vec3 halfVector = normalize(surfaceToLight + surfaceToView);
  vec4 litR = lit(dot(a_normal, surfaceToLight),
                    dot(a_normal, halfVector), u_shininess);
  vec4 outColor = vec4((
  lights[0].u_lightColor * (diffuseColor * litR.y + diffuseColor * u_ambient +
                u_specular * litR.z * u_specularFactor)).rgb,
      diffuseColor.a);
  theColor = outColor;
}