import { AttributeData, Geometry } from '../core/geometry';
import { Mesh } from '../core/mesh';
import { Program } from '../core/program';
import { Color } from '../math/color';

import fragment from './wire-mesh.frag?raw';
import vertex from './wire-mesh.vert?raw';

import type { MeshOptions } from '../core/mesh';
import type { OGLRenderingContext } from '../core/renderer';

export interface WireMeshOptions extends MeshOptions {
  wireColor: Color;
}

/**
 * A wireframe mesh.
 */
export class WireMesh extends Mesh {
  constructor(
    gl: OGLRenderingContext,
    { geometry, wireColor = new Color(0, 0.75, 0.5), ...meshProps }: Partial<WireMeshOptions> = {}
  ) {
    const wireProgram = new Program(gl, {
      vertex,
      fragment,
      uniforms: { wireColor: { value: wireColor } }
    });

    const positionArray = geometry!.attributes.position.data!;
    const indices: number[] = [];
    const hashSet = new Set<string>();

    function addUniqueIndices(idx: number[]) {
      for (let i = 0; i < idx.length; i += 2) {
        if (isUniqueEdgePosition(idx[i] * 3, idx[i + 1] * 3, positionArray, hashSet)) {
          indices.push(idx[i], idx[i + 1]);
        }
      }
    }

    if (geometry!.attributes.index) {
      const idata = geometry!.attributes.index.data!;

      for (let i = 0; i < idata!.length; i += 3) {
        // For every triangle, make three line pairs (start, end)
        // prettier-ignore
        addUniqueIndices([
                    idata[i], idata[i + 1],
                    idata[i + 1], idata[i + 2],
                    idata[i + 2], idata[i]
                ]);
      }
    } else {
      const numVertices = Math.floor(positionArray.length / 3);

      for (let i = 0; i < numVertices; i += 3) {
        addUniqueIndices([i, i + 1, i + 1, i + 2, i + 2, i]);
      }
    }

    const indicesTyped = indices.length > 65536 ? new Uint32Array(indices) : new Uint16Array(indices);
    const wireGeometry = new Geometry(gl, {
      position: { ...geometry!.attributes.position },
      index: { data: indicesTyped }
    });

    super(gl, { ...meshProps, mode: gl.LINES, geometry: wireGeometry, program: wireProgram });
  }
}

// from https://github.com/mrdoob/three.js/blob/0c26bb4bb8220126447c8373154ac045588441de/src/geometries/WireframeGeometry.js#L116
function isUniqueEdgePosition(start: number, end: number, pos: AttributeData, hashSet: Set<string>) {
  // prettier-ignore
  const hash1 = [
        pos[start], pos[start + 1], pos[start + 2],
        pos[end], pos[end + 1], pos[end + 2]
    ].join('#');

  // coincident edge
  // prettier-ignore
  const hash2 = [
        pos[end], pos[end + 1], pos[end + 2],
        pos[start], pos[start + 1], pos[start + 2]
    ].join('#');

  const oldSize = hashSet.size;
  hashSet.add(hash1);
  hashSet.add(hash2);
  return hashSet.size - oldSize === 2;
}
