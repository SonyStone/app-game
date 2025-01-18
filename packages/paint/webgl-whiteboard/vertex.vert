#version 300 es

uniform vec2 u_resolution;
uniform vec2 u_camera_position;

in vec2 a_position;
in vec4 a_color;

uniform vec2 u_position;
uniform vec2 u_scale;

out vec4 v_color;

void main() {
  vec2 newPosition = u_camera_position + ((a_position* u_scale) + u_position);
  // convert the position from pixels to 0.0 to 1.0
  vec2 zeroToOne = newPosition / u_resolution;

  // convert from 0->1 to 0->2
  vec2 zeroToTwo = zeroToOne * 2.0;

  // convert from 0->2 to -1->+1 (clipspace)
  vec2 clipSpace = vec2(zeroToTwo.x - 1.0, 1.0 - zeroToTwo.y);

  gl_Position = vec4(clipSpace, 0, 1);

  v_color = a_color;
}
