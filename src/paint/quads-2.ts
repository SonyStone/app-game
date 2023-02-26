import { new_array, new_element } from "./fungi/Buffer";
import { from_buffer_config, IMesh } from "./fungi/Mesh";

/**
 * Small quad for rendering brush
 * @param gl
 * @returns
 */
export function brush_quad_unit_corner(
  gl: Pick<
    WebGL2RenderingContext,
    | "createVertexArray"
    | "bindVertexArray"
    | "bindBuffer"
    | "enableVertexAttribArray"
    | "vertexAttribPointer"
    | "vertexAttribDivisor"
    | "createBuffer"
    | "bindBuffer"
    | "bufferData"
  >
): IMesh {
  return from_buffer_config(
    gl,
    [
      {
        name: "indices",
        buffer: new_element(gl, new Uint16Array([0, 1, 2, 2, 3, 0])),
      },
      {
        name: "quad",
        buffer: new_array(
          gl,
          new Float32Array([
            0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 0,
          ])
        ),
        interleaved: [
          { attrib_loc: 0, size: 3, stride_len: 5 * 4, offset: 0 * 4 },
          { attrib_loc: 2, size: 2, stride_len: 5 * 4, offset: 3 * 4 },
        ],
      },
    ],
    "BrushQuad",
    6
  );
}

/**
 * Quad for full screan post effets (I gess?)
 * @param gl
 * @returns
 */
export function post_quad_ndc(
  gl: Pick<
    WebGL2RenderingContext,
    | "createVertexArray"
    | "bindVertexArray"
    | "bindBuffer"
    | "enableVertexAttribArray"
    | "vertexAttribPointer"
    | "vertexAttribDivisor"
    | "createBuffer"
    | "bindBuffer"
    | "bufferData"
  >
): IMesh {
  return from_buffer_config(
    gl,
    [
      {
        name: "indices",
        buffer: new_element(gl, new Uint16Array([0, 1, 2, 2, 3, 0])),
      },
      {
        name: "quad",
        buffer: new_array(
          gl,
          new Float32Array([
            -1, 1, 0, 0, 0, -1, -1, 0, 0, 1, 1, -1, 0, 1, 1, 1, 1, 0, 1, 0,
          ])
        ),
        interleaved: [
          { attrib_loc: 0, size: 3, stride_len: 5 * 4, offset: 0 * 4 },
          { attrib_loc: 2, size: 2, stride_len: 5 * 4, offset: 3 * 4 },
        ],
      },
    ],
    "PostQuad",
    6
  );
}
