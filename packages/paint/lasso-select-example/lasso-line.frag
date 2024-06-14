#version 300 es
precision mediump float;

#define WIDTH 1.0
#define COUNT 16.0
#define SPEED 2.0
#define REVERSE false

uniform float uTime;

out vec4 outColor;

vec3 diagonals(vec2 pos, bool reverse) {
    int w = 0;
    float time = SPEED * 10.0 * ((reverse)? uTime : - uTime );
    w = (int(pos.x - pos.y + time) & int(COUNT));
    return vec3(w,w,w);
}


void main() {
  vec3 col = diagonals(gl_FragCoord.xy, REVERSE);
  outColor = vec4(col, 1.0);
}