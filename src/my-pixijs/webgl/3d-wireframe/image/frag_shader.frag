#version 300 es
precision highp float;
 
// our texture
uniform sampler2D u_image;
 
// the texCoords passed in from the vertex shader.
in vec2 v_texCoord;
 
// we need to declare an output for the fragment shader
out vec4 outColor;
 
void main() {
  // box-blur

  vec2 parameters = vec2(2, 1.5);

  vec2 texSize  = vec2(textureSize(u_image, 0).xy);

  outColor = texture(u_image, v_texCoord);

  int size  = int(parameters.x);
  if (size <= 0) {
    return;
  }


  float separation = parameters.y;
  separation = max(separation, 1.0);

  outColor.rgb = vec3(0);

  float count = 0.0;


  for (int i = -size; i <= size; ++i) {
    for (int j = -size; j <= size; ++j) {
      outColor.rgb += texture(u_image, v_texCoord.xy + (vec2(i, j) * separation)/texSize ).rgb;
      count += 1.0;
    }
  }

  outColor.rgb /= count;
}