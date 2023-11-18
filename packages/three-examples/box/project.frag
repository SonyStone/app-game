uniform vec3 color;
uniform sampler2D pointTexture;
uniform vec3 projPosition;

varying vec3 vNormal;
varying vec4 vWorldPosition;
varying vec4 vTexCoords;

void main() {
  vec2 uv = (vTexCoords.xy / vTexCoords.w) * 0.5 + 0.5;

  vec4 outColor = texture2D(pointTexture, uv);

  if (outColor.a < 0.1) /*change threshold to desired output*/
    discard;

  gl_FragColor = outColor;
}