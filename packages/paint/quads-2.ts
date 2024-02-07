import { newArray, newElement } from './fungi/Buffer';
import { fromBufferConfig, type IMesh } from './fungi/mesh-2';

/**
 * Small quad for rendering brush
 * @param gl
 * @returns
 */
export function brush_quad_unit_corner(gl: WebGL2RenderingContext): IMesh {
  return fromBufferConfig(
    gl,
    [
      {
        name: 'indices',
        buffer: newElement(gl, new Uint16Array([0, 1, 2, 2, 3, 0]))
      },
      {
        name: 'quad',
        buffer: newArray(gl, new Float32Array([0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 0])),
        interleaved: [
          { attrib_loc: 0, size: 3, stride_len: 5 * 4, offset: 0 * 4 },
          { attrib_loc: 2, size: 2, stride_len: 5 * 4, offset: 3 * 4 }
        ]
      }
    ],
    'BrushQuad',
    6
  );
}

/**
 * Quad for full screan post effets (I gess?)
 * @param gl
 * @returns
 */
export function postQuadNDC(gl: WebGL2RenderingContext): IMesh {
  return fromBufferConfig(
    gl,
    [
      {
        name: 'indices',
        buffer: newElement(gl, new Uint16Array([0, 1, 2, 2, 3, 0]))
      },
      {
        name: 'quad',
        buffer: newArray(gl, new Float32Array([-1, 1, 0, 0, 0, -1, -1, 0, 0, 1, 1, -1, 0, 1, 1, 1, 1, 0, 1, 0])),
        interleaved: [
          { attrib_loc: 0, size: 3, stride_len: 5 * 4, offset: 0 * 4 },
          { attrib_loc: 2, size: 2, stride_len: 5 * 4, offset: 3 * 4 }
        ]
      }
    ],
    'PostQuad',
    6
  );
}
