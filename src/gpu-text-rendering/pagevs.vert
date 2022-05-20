
uniform vec2 uPositionMul;
uniform vec2 uPositionAdd;

attribute vec2 aPosition;

void main() {
  // Transform position
  vec2 pos = aPosition;
  pos.y = 1.0 - pos.y;
  pos = pos * uPositionMul + uPositionAdd;

  gl_Position = vec4(pos, 0.0, 1.0);
}
