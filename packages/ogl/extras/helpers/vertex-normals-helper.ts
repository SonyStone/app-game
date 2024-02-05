import type { Camera } from '../../core/camera';
import { Geometry } from '../../core/geometry';
import { Mesh } from '../../core/mesh';
import { Program } from '../../core/program';
import { Color } from '../../math/color';
import { Mat3 } from '../../math/mat-3';

import fragment from './vertex-normals-helper.frag?raw';
import vertex from './vertex-normals-helper.vert?raw';

export interface FaceNormalsHelperOptions {
  size: number;
  color: Color;
}

/**
 * Face normals helper.
 * @see {@link https://github.com/oframe/ogl/blob/master/src/extras/helpers/FaceNormalsHelper.js | Source}
 */
export class VertexNormalsHelper extends Mesh {
  constructor(
    readonly object: Mesh,
    { size = 0.1, color = new Color(0.86, 0.16, 0.86), ...meshProps }: Partial<FaceNormalsHelperOptions> = {}
  ) {
    const gl = object.gl;
    const nNormals = object.geometry.attributes.normal.count!;
    const positionsArray = new Float32Array(nNormals * 2 * 3);
    const normalsArray = new Float32Array(nNormals * 2 * 3);
    const sizeArray = new Float32Array(nNormals * 2);

    const normalData = object.geometry.attributes.normal.data!;
    const positionData = object.geometry.attributes.position.data!;

    const sizeData = new Float32Array([0, size]);

    for (let i = 0; i < nNormals; i++) {
      const i6 = i * 6;
      const i3 = i * 3;

      // duplicate position and normal for line start and end point
      const pSub = positionData.subarray(i3, i3 + 3);
      positionsArray.set(pSub, i6);
      positionsArray.set(pSub, i6 + 3);

      const nSub = normalData.subarray(i3, i3 + 3);
      normalsArray.set(nSub, i6);
      normalsArray.set(nSub, i6 + 3);

      sizeArray.set(sizeData, i * 2);
    }

    const geometry = new Geometry(gl, {
      position: { size: 3, data: positionsArray },
      normal: { size: 3, data: normalsArray },
      size: { size: 1, data: sizeArray }
    });

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        color: { value: color },
        worldNormalMatrix: { value: new Mat3() },
        objectWorldMatrix: { value: object.worldMatrix }
      }
    });

    super(gl, { ...meshProps, mode: gl.LINES, geometry, program });
  }

  draw(arg: { camera?: Camera } = {}) {
    this.program.uniforms.worldNormalMatrix.value.getNormalMatrix(this.object.worldMatrix);
    super.draw(arg);
  }
}
