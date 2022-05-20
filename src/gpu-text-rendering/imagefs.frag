precision highp float;
uniform sampler2D uSampler;

varying vec2 vTexCoord;
varying float vAlpha;

void main() {
  gl_FragColor = texture2D(uSampler, vTexCoord);
  //if (vAlpha < 0.0) gl_FragColor.rgb = 1.0 - gl_FragColor.rgb;
  gl_FragColor.a *= abs(vAlpha);
}