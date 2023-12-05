import { Geometry } from '../../core/geometry';
import { Mesh } from '../../core/mesh';
import { Program } from '../../core/program';

import fragment from './axes-helper.frag?raw';
import vertex from './axes-helper.vert?raw';

import type { OGLRenderingContext } from '../../core/renderer';
import { Color } from '../../math/color';

export interface AxesHelperOptions {
  size: number;
  symmetric: boolean;
  xColor: Color;
  yColor: Color;
  zColor: Color;
}

/**
 * Axes helper.
 * @see {@link https://github.com/oframe/ogl/blob/master/src/extras/helpers/AxesHelper.js | Source}
 */
export class AxesHelper extends Mesh {
  constructor(
    gl: OGLRenderingContext,
    {
      size = 1,
      symmetric = false,
      xColor = new Color(0.96, 0.21, 0.32),
      yColor = new Color(0.44, 0.64, 0.11),
      zColor = new Color(0.18, 0.52, 0.89),
      ...meshProps
    }: Partial<AxesHelperOptions> = {}
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
