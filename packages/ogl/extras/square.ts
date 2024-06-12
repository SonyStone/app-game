import { Geometry } from '../core/geometry';
import { OGLRenderingContext } from '../core/renderer';

export class Square extends Geometry {
  constructor(gl: OGLRenderingContext, { attributes = {} } = {}) {
    Object.assign(attributes, {
      position: { size: 2, data: new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]) },
      uv: { size: 2, data: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]) },
      index: { data: new Uint16Array([0, 1, 2, 2, 1, 3]) }
    });

    super(gl, attributes);
  }
}
