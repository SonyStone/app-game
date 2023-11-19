import { Geometry } from '../../core/geometry';
import { Mesh } from '../../core/mesh';
import { Program } from '../../core/program';
import { Vec3 } from '../../math/vec-3';

import fragment from './axes-helper.frag?raw';
import vertex from './axes-helper.vert?raw';

export class AxesHelper extends Mesh {
  constructor(
    gl,
    {
      size = 1,
      symmetric = false,
      xColor = new Vec3(0.96, 0.21, 0.32),
      yColor = new Vec3(0.44, 0.64, 0.11),
      zColor = new Vec3(0.18, 0.52, 0.89),
      ...meshProps
    } = {}
  ) {
    const a = symmetric ? -size : 0;
    const b = size;

    // prettier-ignore
    const vertices = new Float32Array([
			a, 0, 0,  b, 0, 0,
			0, a, 0,  0, b, 0,
			0, 0, a,  0, 0, b
		]);

    // prettier-ignore
    const colors = new Float32Array([
			...xColor,  ...xColor,
			...yColor,  ...yColor,
			...zColor,  ...zColor
		]);

    const geometry = new Geometry(gl, {
      position: { size: 3, data: vertices },
      color: { size: 3, data: colors }
    });

    const program = new Program(gl, { vertex, fragment });

    super(gl, { ...meshProps, mode: gl.LINES, geometry, program });
  }
}
