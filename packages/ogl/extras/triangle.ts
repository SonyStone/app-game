import { Geometry } from '../core/geometry';
import { OGLRenderingContext } from '../core/renderer';

export class Triangle extends Geometry {
  constructor(gl: OGLRenderingContext, { attributes = {} } = {}) {
    Object.assign(attributes, {
      position: { size: 2, data: new Float32Array([-1, -1, 3, -1, -1, 3]) },
      uv: { size: 2, data: new Float32Array([0, 0, 2, 0, 0, 2]) }
    });

    super(gl, attributes);
  }
}
