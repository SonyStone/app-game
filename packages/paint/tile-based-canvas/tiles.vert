#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

uniform vec2 u_canvasSize;
uniform vec2 u_tileOffset;
uniform vec2 u_tileSize;

void main() {
    // Convert from pixel coordinates to normalized device coordinates [-1,1]
    // a_position = local quad coords (e.g., 0..tileWidth, 0..tileHeight)
    // u_tileOffset = where the tile is positioned on the global canvas
    // u_canvasSize = total size of the canvas
    // For a simple approach, just offset and scale
  vec2 pos = (u_tileOffset + a_position) / u_canvasSize * 2.0f - 1.0f;
  gl_Position = vec4(pos, 0.0f, 1.0f);

    // Pass through tex coord
  v_texCoord = a_texCoord;
}
