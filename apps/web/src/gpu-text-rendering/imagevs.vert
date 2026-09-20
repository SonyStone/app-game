uniform vec2 uPositionMul;
uniform vec2 uPositionAdd;
uniform mat2 uRotation;

attribute vec2 aPosition;
attribute vec2 aTexCoord;
attribute float aAlpha;
attribute float aInvert;

varying float vAlpha;
varying vec2 vTexCoord;

void main() {
  vTexCoord = aTexCoord;
  vAlpha = aInvert > 0.0 ? -aAlpha : aAlpha;

  // Transform position
  vec2 pos = aPosition;
  pos.y = 1.0 - pos.y;
  pos = pos * uPositionMul + uPositionAdd;
  gl_Position = vec4(uRotation * pos, 0.0, 1.0);
}