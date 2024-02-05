import { Geometry } from '../../core/geometry';
import { Mesh } from '../../core/mesh';
import { Program } from '../../core/program';

import type { OGLRenderingContext } from '../../core/renderer';
import { Color } from '../../math/color';

import fragment from './grid-helper.frag?raw';
import vertex from './grid-helper.vert?raw';

export interface GridHelperOptions {
  size: number;
  divisions: number;
  color: Color;
}

/**
 * Grid helper.
 * @see {@link https://github.com/oframe/ogl/blob/master/src/extras/helpers/GridHelper.js | Source}
 */
export class GridHelper extends Mesh {
  constructor(
    gl: OGLRenderingContext,
    { size = 10, divisions = 10, color = new Color(0.75, 0.75, 0.75), ...meshProps }: Partial<GridHelperOptions> = {}
  ) {
    const numVertices = (size + 1) * 2 * 2;
    const vertices = new Float32Array(numVertices * 3);

    const hs = size / 2;
    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      const o = t * size - hs;

      vertices.set([o, 0, -hs, o, 0, hs], i * 12);
      vertices.set([-hs, 0, o, hs, 0, o], i * 12 + 6);
    }

    const geometry = new Geometry(gl, {
      position: { size: 3, data: vertices }
    });

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        color: { value: color }
      }
    });
    super(gl, { ...meshProps, mode: gl.LINES, geometry, program });
  }
}
