import { GL_BUFFER_TYPE } from '@packages/webgl/static-variables';
import { fromTypeArray, newArray, newElement } from './fungi/Buffer';
import { fromBufferConfig, type IMesh } from './fungi/mesh';

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
 * (Normalized Device Coordinates)
 */
export function postQuadNDC(gl: WebGL2RenderingContext): IMesh {
  return fromBufferConfig(
    gl,
    [
      {
        name: 'indices',
        buffer: fromTypeArray(gl, GL_BUFFER_TYPE.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 2, 3, 0]), true, true)
      },
      {
        name: 'quad',
        buffer: fromTypeArray(
          gl,
          GL_BUFFER_TYPE.ARRAY_BUFFER,
          new Float32Array([-1, 1, 0, 0, 0, -1, -1, 0, 0, 1, 1, -1, 0, 1, 1, 1, 1, 0, 1, 0]),
          true,
          true
        ),
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
