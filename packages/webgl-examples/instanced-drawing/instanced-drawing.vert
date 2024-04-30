#version 300 es
in vec4 a_position;
in vec4 color;
in mat4 matrix;
uniform mat4 projection;
uniform mat4 view;

out vec4 v_color;

void main() {
  // Multiply the position by the matrix.
  gl_Position = projection * view * matrix * a_position;

  // Pass the vertex color to the fragment shader.
  v_color = color;
}