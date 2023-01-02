import { new_array, new_element } from "./fungi/Buffer";
import { from_buffer_config, IMesh } from "./fungi/Mesh";

/**
 * Small quad for rendering brush
 * @param ctx
 * @returns
 */
export function brush_quad_unit_corner(ctx: WebGL2RenderingContext): IMesh {
  const buf_idx = new_element(ctx, new Uint16Array([0, 1, 2, 2, 3, 0]));
  const buf_vert = new_array(
    ctx,
    new Float32Array([
      0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 0,
    ])
  );

  const mesh = from_buffer_config(
    ctx,
    [
      { name: "indices", buffer: buf_idx },
      {
        name: "quad",
        buffer: buf_vert,
        interleaved: [
          { attrib_loc: 0, size: 3, stride_len: 5 * 4, offset: 0 * 4 },
          { attrib_loc: 2, size: 2, stride_len: 5 * 4, offset: 3 * 4 },
        ],
      },
    ],
    "BrushQuad",
    6
  );

  return mesh;
}

/**
 * Quad for full screan post effets (I gess?)
 * @param ctx
 * @returns
 */
export function post_quad_ndc(ctx: WebGL2RenderingContext): IMesh {
  let buf_idx = new_element(ctx, new Uint16Array([0, 1, 2, 2, 3, 0]));
  let buf_vert = new_array(
    ctx,
    new Float32Array([
      -1, 1, 0, 0, 0, -1, -1, 0, 0, 1, 1, -1, 0, 1, 1, 1, 1, 0, 1, 0,
    ])
  );

  const mesh = from_buffer_config(
    ctx,
    [
      { name: "indices", buffer: buf_idx },
      {
        name: "quad",
        buffer: buf_vert,
        interleaved: [
          { attrib_loc: 0, size: 3, stride_len: 5 * 4, offset: 0 * 4 },
          { attrib_loc: 2, size: 2, stride_len: 5 * 4, offset: 3 * 4 },
        ],
      },
    ],
    "PostQuad",
    6
  );

  return mesh;
}
