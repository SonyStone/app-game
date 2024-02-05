import { Geometry } from '../../core/geometry';
import { Mesh } from '../../core/mesh';
import { Program } from '../../core/program';
import { Mat3 } from '../../math/mat-3';
import { Vec3 } from '../../math/vec-3';

import { Color } from '../../math/color';

import { Camera } from '../../core/camera';
import fragment from './face-normals-helper.frag?raw';
import vertex from './face-normals-helper.vert?raw';

const vA = /* @__PURE__ */ new Vec3();
const vB = /* @__PURE__ */ new Vec3();
const vC = /* @__PURE__ */ new Vec3();
const vCenter = /* @__PURE__ */ new Vec3();
const vNormal = /* @__PURE__ */ new Vec3();

export interface FaceNormalsHelperOptions {
  size: number;
  color: Color;
}

/**
 * Face normals helper.
 * @see {@link https://github.com/oframe/ogl/blob/master/src/extras/helpers/FaceNormalsHelper.js | Source}
 */
export class FaceNormalsHelper extends Mesh {
  constructor(
    readonly object: Mesh,
    { size = 0.1, color = new Color(0.15, 0.86, 0.86), ...meshProps }: Partial<FaceNormalsHelperOptions> = {}
  ) {
    const gl = object.gl;

    const positionData = object.geometry.attributes.position.data!;
    const sizeData = new Float32Array([0, size]);

    const indexAttr = object.geometry.attributes.index!;
    const getIndex = indexAttr ? (i: number) => indexAttr.data![i] : (i: number) => i;
    const numVertices = indexAttr ? indexAttr.data!.length : Math.floor(positionData.length / 3);

    const nNormals = Math.floor(numVertices / 3);
    const positionsArray = new Float32Array(nNormals * 2 * 3);
    const normalsArray = new Float32Array(nNormals * 2 * 3);
    const sizeArray = new Float32Array(nNormals * 2);

    for (let i = 0; i < numVertices; i += 3) {
      vA.fromArray(positionData, getIndex(i + 0) * 3);
      vB.fromArray(positionData, getIndex(i + 1) * 3);
      vC.fromArray(positionData, getIndex(i + 2) * 3);

      vCenter
        .add(vA, vB)
        .add(vC)
        .multiply(1 / 3);

      vA.sub(vA, vB);
      vC.sub(vC, vB);
      vNormal.cross(vC, vA).normalize();

      // duplicate position and normal for line start and end point
      const i2 = i * 2;
      positionsArray.set(vCenter, i2);
      positionsArray.set(vCenter, i2 + 3);

      normalsArray.set(vNormal, i2);
      normalsArray.set(vNormal, i2 + 3);
      sizeArray.set(sizeData, (i / 3) * 2);
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

  draw(arg: { camera?: Camera } = {}): void {
    this.program.uniforms.worldNormalMatrix.value.getNormalMatrix(this.object.worldMatrix);
    super.draw(arg);
  }
}
